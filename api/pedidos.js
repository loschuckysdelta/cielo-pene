const { setCors, send, error, readBody, normalizeText, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { currentClient, requireClient } = require('./_lib/client-auth');
const { createOrderNotification, createNotification } = require('./_lib/notifications');

const ORDER_STATUSES = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado'];

function orderCode() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `A2-${y}${m}${day}-${rnd}`;
}

function money(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function actorInfo(actor) {
  return actor ? { id: String(actor._id || actor.id || ''), nombre: actor.nombre || actor.email || 'Administrador' } : { id: '', nombre: 'Sistema' };
}
function historyEntry(status, actor) {
  return { estado: status, fecha: new Date().toISOString(), actor: actorInfo(actor) };
}

async function getProductById(productosCol, id) {
  if (productosCol) {
    const _id = oid(id);
    if (!_id) return null;
    return productosCol.findOne({ _id });
  }
  return memory.productos.find(p => p.id === id) || null;
}

async function getZone(deliveryCol, id) {
  if (!id) return null;
  if (deliveryCol) {
    const _id = oid(id);
    if (!_id) return null;
    return deliveryCol.findOne({ _id });
  }
  return memory.delivery.find(z => z.id === id) || null;
}

function couponAvailable(c) {
  if (!c || c.activo === false) return false;
  if (c.vence && new Date(c.vence + 'T23:59:59') < new Date()) return false;
  const limite = Number(c.limiteUsos) || 0;
  const usos = Number(c.usos) || 0;
  return limite <= 0 || usos < limite;
}

async function getCoupon(cuponesCol, codigo) {
  if (!codigo) return null;
  const code = normalizeText(codigo).toUpperCase();
  if (!code) return null;
  if (cuponesCol) return cuponesCol.findOne({ codigo: code, activo: true });
  return memory.cupones.find(c => c.codigo === code && c.activo) || null;
}

async function consumeCoupon(cuponesCol, codigo) {
  const code = normalizeText(codigo).toUpperCase();
  if (!code) return null;
  if (cuponesCol) {
    const cup = await cuponesCol.findOne({ codigo: code, activo: true });
    if (!couponAvailable(cup)) throw new Error(`El cupón ${code} ya no tiene usos disponibles.`);
    const limite = Number(cup.limiteUsos) || 0;
    const filtro = limite > 0 ? { codigo: code, activo: true, usos: { $lt: limite } } : { codigo: code, activo: true };
    const r = await cuponesCol.updateOne(filtro, { $inc: { usos: 1 }, $set: { updatedAt: new Date().toISOString() } });
    if (r.modifiedCount !== 1) throw new Error(`No se pudo aplicar el cupón ${code}. Ya se agotó.`);
    return cuponesCol.findOne({ codigo: code });
  }
  const c = memory.cupones.find(x => x.codigo === code && x.activo);
  if (!couponAvailable(c)) throw new Error(`El cupón ${code} ya no tiene usos disponibles.`);
  c.usos = (Number(c.usos) || 0) + 1;
  c.updatedAt = new Date().toISOString();
  return c;
}

async function restoreCoupon(cuponesCol, codigo) {
  const code = normalizeText(codigo).toUpperCase();
  if (!code) return;
  if (cuponesCol) {
    await cuponesCol.updateOne({ codigo: code, usos: { $gt: 0 } }, { $inc: { usos: -1 }, $set: { updatedAt: new Date().toISOString() } });
    return;
  }
  const c = memory.cupones.find(x => x.codigo === code);
  if (c) c.usos = Math.max(0, (Number(c.usos) || 0) - 1);
}

async function buildPedido(body) {
  const productosCol = await collection('productos');
  const deliveryCol = await collection('delivery');
  const cuponesCol = await collection('cupones');

  const cliente = body.cliente || {};
  const nombre = normalizeText(cliente.nombre || body.nombre);
  const telefono = normalizeText(cliente.telefono || body.telefono);
  const email = normalizeText(cliente.email || body.email).toLowerCase();
  const entrega = normalizeText(cliente.entrega || body.entrega || 'recojo');
  const direccion = normalizeText(cliente.direccion || body.direccion);
  const zonaId = normalizeText(cliente.zonaId || body.zonaId);
  const nota = normalizeText(cliente.nota || body.nota);

  if (!nombre) throw new Error('El cliente debe llenar su nombre.');
  if (!telefono) throw new Error('El cliente debe llenar su teléfono.');
  if (!['recojo', 'delivery'].includes(entrega)) throw new Error('Tipo de entrega inválido.');
  if (entrega === 'delivery' && !direccion) throw new Error('Para delivery debe llenar dirección exacta.');
  if (entrega === 'delivery' && !zonaId) throw new Error('Para delivery debe elegir una zona.');

  const inputItems = Array.isArray(body.items) ? body.items : [];
  if (inputItems.length === 0) throw new Error('El pedido no tiene productos.');

  const items = [];
  let subtotal = 0;
  for (const item of inputItems) {
    const productoId = normalizeText(item.productoId || item.id);
    const cantidad = Math.max(1, Math.floor(toNumber(item.cantidad, 0)));
    if (!productoId || cantidad <= 0) continue;
    const prod = await getProductById(productosCol, productoId);
    if (!prod) throw new Error(`Producto no encontrado: ${productoId}`);
    if (prod.activo === false) throw new Error(`Producto no disponible: ${prod.nombre}`);
    if ((Number(prod.stock) || 0) < cantidad) throw new Error(`Stock insuficiente para ${prod.nombre}. Stock actual: ${prod.stock}.`);
    const precioBase = money(prod.precio);
    const descuentoProducto = Math.max(0, Math.min(100, Number(prod.descuento) || 0));
    const precio = money(precioBase * (1 - descuentoProducto / 100));
    const sub = money(precio * cantidad);
    subtotal = money(subtotal + sub);
    items.push({
      productoId: String(prod._id || prod.id), nombre: prod.nombre, categoriaNombre: prod.categoriaNombre || '',
      cantidad, precio, subtotal: sub, stockAlCrear: Number(prod.stock) || 0
    });
  }
  if (items.length === 0) throw new Error('El pedido no tiene productos válidos.');

  let zona = null;
  let deliveryPrecio = 0;
  let deliveryTexto = 'Recojo en tienda';
  if (entrega === 'delivery') {
    zona = await getZone(deliveryCol, zonaId);
    if (!zona) throw new Error('La zona de delivery no existe.');
    if (zona.activo === false) throw new Error('Esa zona de delivery está inactiva.');
    if (zona.disponible === false) throw new Error('A esa zona no llega delivery.');
    deliveryTexto = zona.tipoPrecio === 'coordinar' ? 'Delivery por coordinar' : `Delivery ${zona.nombre}`;
    deliveryPrecio = zona.tipoPrecio === 'coordinar' ? 0 : money(zona.precio);
  }

  const cuponInput = body.cupon || cliente.cupon;
  const cupon = await getCoupon(cuponesCol, cuponInput);
  let descuento = 0;
  let cuponCodigo = '';
  let cuponModoUso = '';
  let cuponLimiteUsos = 0;
  let cuponUsosAlCrear = 0;
  if (cuponInput && !cupon) throw new Error('El cupón no existe o está inactivo.');
  if (cupon) {
    if (!couponAvailable(cupon)) throw new Error(`El cupón ${cupon.codigo} ya se agotó.`);
    cuponCodigo = cupon.codigo;
    cuponModoUso = Number(cupon.limiteUsos) > 0 ? 'limitado' : 'ilimitado';
    cuponLimiteUsos = Number(cupon.limiteUsos) || 0;
    cuponUsosAlCrear = Number(cupon.usos) || 0;
    descuento = cupon.tipo === 'monto' ? money(cupon.valor) : money(subtotal * (Number(cupon.valor) / 100));
    descuento = Math.min(descuento, subtotal);
  }

  const total = money(subtotal + deliveryPrecio - descuento);
  const now = new Date().toISOString();
  return {
    codigo: orderCode(),
    cliente: { nombre, telefono, email, entrega, direccion, zonaId: zona ? String(zona._id || zona.id) : '', zonaNombre: zona ? zona.nombre : '', nota },
    items, subtotal,
    delivery: { texto: deliveryTexto, zonaId: zona ? String(zona._id || zona.id) : '', zonaNombre: zona ? zona.nombre : '', precio: deliveryPrecio, porCoordinar: zona ? zona.tipoPrecio === 'coordinar' : false },
    cupon: cuponCodigo, cuponModoUso, cuponLimiteUsos, cuponUsosAlCrear, cuponDescontado: false,
    descuento, total, estado: 'pendiente', stockDescontado: false,
    historialStock: [], historialEstados: [historyEntry('pendiente', null)],
    createdAt: now, updatedAt: now
  };
}

async function getOrder(id) {
  const col = await collection('pedidos');
  if (col) {
    const _id = oid(id);
    return _id ? col.findOne({ _id }) : null;
  }
  return (memory.pedidos || []).find(p => String(p.id) === String(id)) || null;
}

async function confirmarPedido(id, actor) {
  const pedidosCol = await collection('pedidos');
  const productosCol = await collection('productos');
  const cuponesCol = await collection('cupones');
  const now = new Date().toISOString();

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.stockDescontado) return publicDoc(pedido);
    if (pedido.estado === 'cancelado') throw new Error('No puedes confirmar un pedido cancelado.');

    let couponConsumed = false;
    const historial = [];
    const aplicados = [];
    try {
      if (pedido.cupon && !pedido.cuponDescontado) {
        await consumeCoupon(cuponesCol, pedido.cupon);
        couponConsumed = true;
      }
      for (const item of pedido.items || []) {
        const pid = oid(item.productoId);
        if (!pid) throw new Error(`Producto inválido en pedido: ${item.nombre}`);
        const prod = await productosCol.findOne({ _id: pid });
        if (!prod) throw new Error(`Producto no encontrado: ${item.nombre}`);
        const stockActual = Number(prod.stock) || 0;
        const qty = Number(item.cantidad) || 0;
        if (stockActual < qty) throw new Error(`Stock insuficiente para ${prod.nombre}. Stock actual: ${stockActual}, pedido: ${qty}.`);
        const r = await productosCol.updateOne({ _id: pid, stock: { $gte: qty } }, { $inc: { stock: -qty }, $set: { updatedAt: now } });
        if (r.modifiedCount !== 1) throw new Error(`No se pudo descontar stock de ${prod.nombre}. Intenta otra vez.`);
        const nuevo = await productosCol.findOne({ _id: pid });
        if ((Number(nuevo.stock) || 0) <= 0) await productosCol.updateOne({ _id: pid }, { $set: { activo: false, updatedAt: now } });
        aplicados.push({ _id: pid, qty });
        historial.push({ productoId: String(pid), nombre: prod.nombre, cantidad: qty, stockAntes: stockActual, stockDespues: Math.max(0, stockActual - qty), fecha: now });
      }
    } catch (e) {
      for (const rollback of aplicados) await productosCol.updateOne({ _id: rollback._id }, { $inc: { stock: rollback.qty }, $set: { activo: true, updatedAt: now } });
      if (couponConsumed) await restoreCoupon(cuponesCol, pedido.cupon);
      throw e;
    }

    await pedidosCol.updateOne({ _id }, {
      $set: { estado: 'confirmado', stockDescontado: true, cuponDescontado: Boolean(pedido.cupon) || Boolean(pedido.cuponDescontado), historialStock: historial, updatedAt: now },
      $push: { historialEstados: historyEntry('confirmado', actor) }
    });
    return publicDoc(await pedidosCol.findOne({ _id }));
  }

  const pedido = (memory.pedidos || []).find(p => String(p.id) === String(id));
  if (!pedido) throw new Error('Pedido no encontrado.');
  if (pedido.stockDescontado) return pedido;
  if (pedido.estado === 'cancelado') throw new Error('No puedes confirmar un pedido cancelado.');
  if (pedido.cupon && !pedido.cuponDescontado) await consumeCoupon(null, pedido.cupon);
  const historial = [];
  for (const item of pedido.items || []) {
    const prod = memory.productos.find(p => p.id === item.productoId);
    if (!prod) throw new Error(`Producto no encontrado: ${item.nombre}`);
    const stockActual = Number(prod.stock) || 0;
    const qty = Number(item.cantidad) || 0;
    if (stockActual < qty) throw new Error(`Stock insuficiente para ${prod.nombre}. Stock actual: ${stockActual}, pedido: ${qty}.`);
    prod.stock = stockActual - qty;
    if (prod.stock <= 0) prod.activo = false;
    prod.updatedAt = now;
    historial.push({ productoId: prod.id, nombre: prod.nombre, cantidad: qty, stockAntes: stockActual, stockDespues: prod.stock, fecha: now });
  }
  Object.assign(pedido, { estado: 'confirmado', stockDescontado: true, cuponDescontado: Boolean(pedido.cupon) || Boolean(pedido.cuponDescontado), historialStock: historial, updatedAt: now });
  if (!Array.isArray(pedido.historialEstados)) pedido.historialEstados = [];
  pedido.historialEstados.push(historyEntry('confirmado', actor));
  return pedido;
}

async function cancelarPedido(id, actor) {
  const pedidosCol = await collection('pedidos');
  const productosCol = await collection('productos');
  const cuponesCol = await collection('cupones');
  const now = new Date().toISOString();

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.estado === 'cancelado') return publicDoc(pedido);
    if (pedido.stockDescontado) {
      for (const item of pedido.items || []) {
        const pid = oid(item.productoId);
        if (pid) await productosCol.updateOne({ _id: pid }, { $inc: { stock: Number(item.cantidad) || 0 }, $set: { activo: true, updatedAt: now } });
      }
    }
    if (pedido.cupon && pedido.cuponDescontado) await restoreCoupon(cuponesCol, pedido.cupon);
    await pedidosCol.updateOne({ _id }, {
      $set: { estado: 'cancelado', stockDescontado: false, cuponDescontado: false, updatedAt: now },
      $push: { historialEstados: historyEntry('cancelado', actor) }
    });
    return publicDoc(await pedidosCol.findOne({ _id }));
  }

  const pedido = (memory.pedidos || []).find(p => String(p.id) === String(id));
  if (!pedido) throw new Error('Pedido no encontrado.');
  if (pedido.estado === 'cancelado') return pedido;
  if (pedido.stockDescontado) {
    for (const item of pedido.items || []) {
      const prod = memory.productos.find(p => p.id === item.productoId);
      if (prod) { prod.stock = (Number(prod.stock) || 0) + (Number(item.cantidad) || 0); prod.activo = true; prod.updatedAt = now; }
    }
  }
  if (pedido.cupon && pedido.cuponDescontado) await restoreCoupon(null, pedido.cupon);
  Object.assign(pedido, { estado: 'cancelado', stockDescontado: false, cuponDescontado: false, updatedAt: now });
  if (!Array.isArray(pedido.historialEstados)) pedido.historialEstados = [];
  pedido.historialEstados.push(historyEntry('cancelado', actor));
  return pedido;
}

async function setOrderStatus(id, nextStatus, actor) {
  const status = normalizeText(nextStatus).toLowerCase();
  if (!ORDER_STATUSES.includes(status)) throw new Error('Estado de pedido inválido.');
  let order = await getOrder(id);
  if (!order) throw new Error('Pedido no encontrado.');
  if (order.estado === status) return publicDoc(order);
  if (status === 'cancelado') {
    const updated = await cancelarPedido(id, actor);
    await createOrderNotification(updated, 'cancelado');
    return updated;
  }
  if (status === 'pendiente' && order.stockDescontado) throw new Error('No puedes regresar a pendiente después de descontar el stock.');
  if (status !== 'pendiente' && !order.stockDescontado) {
    await confirmarPedido(id, actor);
    order = await getOrder(id);
  }
  if (status === 'confirmado') {
    const updated = publicDoc(await getOrder(id));
    await createOrderNotification(updated, 'confirmado');
    return updated;
  }

  const col = await collection('pedidos');
  const now = new Date().toISOString();
  let updated;
  if (col) {
    const _id = oid(id);
    await col.updateOne({ _id }, { $set: { estado: status, updatedAt: now }, $push: { historialEstados: historyEntry(status, actor) } });
    updated = publicDoc(await col.findOne({ _id }));
  } else {
    order.estado = status;
    order.updatedAt = now;
    if (!Array.isArray(order.historialEstados)) order.historialEstados = [];
    order.historialEstados.push(historyEntry(status, actor));
    updated = order;
  }
  await createOrderNotification(updated, status);
  return updated;
}

async function sendCustomNotice(id, title, message) {
  const order = await getOrder(id);
  if (!order) throw new Error('Pedido no encontrado.');
  if (!order.clienteId) throw new Error('Este pedido no está vinculado a una cuenta de cliente.');
  const cleanMessage = normalizeText(message);
  if (!cleanMessage) throw new Error('Escribe el mensaje de la notificación.');
  return createNotification({
    clienteId: order.clienteId,
    orderId: String(order._id || order.id || ''),
    orderCode: order.codigo || '',
    title: normalizeText(title) || 'Mensaje de Cielo Postres',
    message: cleanMessage,
    type: 'personalizada'
  });
}


function actionFrom(req) {
  if (req.query && req.query.action) return normalizeText(req.query.action).toLowerCase();
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return normalizeText(url.searchParams.get('action')).toLowerCase();
  } catch (_) {
    return '';
  }
}

async function handleMyOrders(req, res) {
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');
  const client = await requireClient(req, res);
  if (!client) return;
  const clienteId = String(client._id || client.id);
  const col = await collection('pedidos');
  if (col) {
    const docs = await col.find({ clienteId }).sort({ createdAt: -1 }).limit(100).toArray();
    return send(res, 200, { ok: true, data: publicList(docs) });
  }
  const docs = (memory.pedidos || [])
    .filter(p => String(p.clienteId || '') === clienteId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return send(res, 200, { ok: true, data: docs });
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();

    const action = actionFrom(req);
    if (action === 'mis-pedidos') return await handleMyOrders(req, res);

    const pedidosCol = await collection('pedidos');
    const id = req.query.id;

    if (req.method === 'POST') {
      const body = await readBody(req);
      const pedido = await buildPedido(body);
      const client = await currentClient(req);
      if (client) {
        pedido.clienteId = String(client._id || client.id);
        pedido.cliente.email = client.email || pedido.cliente.email || '';
        if (!pedido.cliente.nombre) pedido.cliente.nombre = client.nombre || '';
        if (!pedido.cliente.telefono) pedido.cliente.telefono = client.telefono || '';
      }
      let saved;
      if (pedidosCol) {
        const r = await pedidosCol.insertOne(pedido);
        saved = { ...pedido, _id: r.insertedId, id: String(r.insertedId) };
      } else {
        saved = { ...pedido, id: memoryId() };
        memory.pedidos.push(saved);
      }
      await createOrderNotification(saved, 'pendiente');
      return send(res, 201, { ok: true, data: publicDoc(saved) });
    }

    const auth = await requireAuth(req, res, 'pedidos');
    if (!auth) return;

    if (req.method === 'GET') {
      if (pedidosCol) {
        const docs = await pedidosCol.find({}).sort({ createdAt: -1 }).limit(300).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = [...memory.pedidos].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de pedido.');
      const body = await readBody(req);
      const accion = normalizeText(body.accion || req.query.accion).toLowerCase();
      if (accion === 'confirmar') return send(res, 200, { ok: true, data: await setOrderStatus(id, 'confirmado', auth.user), mensaje: 'Pedido confirmado y cliente notificado.' });
      if (accion === 'cancelar') return send(res, 200, { ok: true, data: await setOrderStatus(id, 'cancelado', auth.user), mensaje: 'Pedido cancelado y cliente notificado.' });
      if (accion === 'estado') return send(res, 200, { ok: true, data: await setOrderStatus(id, body.estado, auth.user), mensaje: 'Estado actualizado y cliente notificado.' });
      if (accion === 'notificar') return send(res, 200, { ok: true, data: await sendCustomNotice(id, body.titulo, body.mensaje), mensaje: 'Notificación enviada al cliente.' });
      return error(res, 400, 'Acción inválida. Usa confirmar, cancelar, estado o notificar.');
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de pedido.');
      if (pedidosCol) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await pedidosCol.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.pedidos = memory.pedidos.filter(p => p.id !== id);
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en pedidos.');
  }
};
