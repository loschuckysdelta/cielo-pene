const { setCors, send, error, readBody, normalizeText, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');

function orderCode() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `A2-${y}${m}${day}-${rnd}`;
}

function money(n) { return Math.round((Number(n) || 0) * 100) / 100; }

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
    const filtro = limite > 0
      ? { codigo: code, activo: true, usos: { $lt: limite } }
      : { codigo: code, activo: true };
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

    const precio = money(prod.precio);
    const sub = money(precio * cantidad);
    subtotal = money(subtotal + sub);
    items.push({
      productoId: String(prod._id || prod.id),
      nombre: prod.nombre,
      categoriaNombre: prod.categoriaNombre || '',
      cantidad,
      precio,
      subtotal: sub,
      stockAlCrear: Number(prod.stock) || 0
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

  return {
    codigo: orderCode(),
    cliente: { nombre, telefono, entrega, direccion, zonaId: zona ? String(zona._id || zona.id) : '', zonaNombre: zona ? zona.nombre : '', nota },
    items,
    subtotal,
    delivery: { texto: deliveryTexto, zonaId: zona ? String(zona._id || zona.id) : '', zonaNombre: zona ? zona.nombre : '', precio: deliveryPrecio, porCoordinar: zona ? zona.tipoPrecio === 'coordinar' : false },
    cupon: cuponCodigo,
    cuponModoUso,
    cuponLimiteUsos,
    cuponUsosAlCrear,
    cuponDescontado: false,
    descuento,
    total,
    estado: 'pendiente',
    stockDescontado: false,
    historialStock: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function confirmarPedido(id) {
  const pedidosCol = await collection('pedidos');
  const productosCol = await collection('productos');
  const cuponesCol = await collection('cupones');

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.estado === 'confirmado' && pedido.stockDescontado) return publicDoc(pedido);
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

        const r = await productosCol.updateOne({ _id: pid, stock: { $gte: qty } }, { $inc: { stock: -qty }, $set: { updatedAt: new Date().toISOString() } });
        if (r.modifiedCount !== 1) throw new Error(`No se pudo descontar stock de ${prod.nombre}. Intenta otra vez.`);
        const nuevo = await productosCol.findOne({ _id: pid });
        if ((Number(nuevo.stock) || 0) <= 0) await productosCol.updateOne({ _id: pid }, { $set: { activo: false, updatedAt: new Date().toISOString() } });
        aplicados.push({ _id: pid, qty });
        historial.push({ productoId: String(pid), nombre: prod.nombre, cantidad: qty, stockAntes: stockActual, stockDespues: Math.max(0, stockActual - qty), fecha: new Date().toISOString() });
      }
    } catch (e) {
      for (const rollback of aplicados) await productosCol.updateOne({ _id: rollback._id }, { $inc: { stock: rollback.qty }, $set: { activo: true, updatedAt: new Date().toISOString() } });
      if (couponConsumed) await restoreCoupon(cuponesCol, pedido.cupon);
      throw e;
    }

    await pedidosCol.updateOne({ _id }, { $set: { estado: 'confirmado', stockDescontado: true, cuponDescontado: Boolean(pedido.cupon) || Boolean(pedido.cuponDescontado), historialStock: historial, updatedAt: new Date().toISOString() } });
    const actualizado = await pedidosCol.findOne({ _id });
    return publicDoc(actualizado);
  }

  const i = memory.pedidos.findIndex(p => p.id === id);
  if (i < 0) throw new Error('Pedido no encontrado.');
  const pedido = memory.pedidos[i];
  if (pedido.estado === 'confirmado' && pedido.stockDescontado) return pedido;
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
    prod.updatedAt = new Date().toISOString();
    historial.push({ productoId: prod.id, nombre: prod.nombre, cantidad: qty, stockAntes: stockActual, stockDespues: prod.stock, fecha: new Date().toISOString() });
  }
  memory.pedidos[i] = { ...pedido, estado: 'confirmado', stockDescontado: true, cuponDescontado: Boolean(pedido.cupon) || Boolean(pedido.cuponDescontado), historialStock: historial, updatedAt: new Date().toISOString() };
  return memory.pedidos[i];
}

async function cancelarPedido(id) {
  const pedidosCol = await collection('pedidos');
  const productosCol = await collection('productos');
  const cuponesCol = await collection('cupones');

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.estado === 'cancelado') return publicDoc(pedido);

    if (pedido.stockDescontado) {
      for (const item of pedido.items || []) {
        const pid = oid(item.productoId);
        if (pid) await productosCol.updateOne({ _id: pid }, { $inc: { stock: Number(item.cantidad) || 0 }, $set: { activo: true, updatedAt: new Date().toISOString() } });
      }
    }
    if (pedido.cupon && pedido.cuponDescontado) await restoreCoupon(cuponesCol, pedido.cupon);
    await pedidosCol.updateOne({ _id }, { $set: { estado: 'cancelado', stockDescontado: false, cuponDescontado: false, updatedAt: new Date().toISOString() } });
    const actualizado = await pedidosCol.findOne({ _id });
    return publicDoc(actualizado);
  }

  const i = memory.pedidos.findIndex(p => p.id === id);
  if (i < 0) throw new Error('Pedido no encontrado.');
  const pedido = memory.pedidos[i];
  if (pedido.stockDescontado) {
    for (const item of pedido.items || []) {
      const prod = memory.productos.find(p => p.id === item.productoId);
      if (prod) { prod.stock = (Number(prod.stock) || 0) + (Number(item.cantidad) || 0); prod.activo = true; }
    }
  }
  if (pedido.cupon && pedido.cuponDescontado) await restoreCoupon(null, pedido.cupon);
  memory.pedidos[i] = { ...pedido, estado: 'cancelado', stockDescontado: false, cuponDescontado: false, updatedAt: new Date().toISOString() };
  return memory.pedidos[i];
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const pedidosCol = await collection('pedidos');
    const id = req.query.id;

    if (req.method === 'GET') {
      if (pedidosCol) {
        const docs = await pedidosCol.find({}).sort({ createdAt: -1 }).limit(200).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = [...memory.pedidos].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const pedido = await buildPedido(body);
      if (pedidosCol) {
        const r = await pedidosCol.insertOne(pedido);
        return send(res, 201, { ok: true, data: { ...pedido, id: String(r.insertedId) } });
      }
      const doc = { ...pedido, id: memoryId() };
      memory.pedidos.push(doc);
      return send(res, 201, { ok: true, data: doc });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de pedido.');
      const body = await readBody(req);
      const accion = normalizeText(body.accion || req.query.accion);
      if (accion === 'confirmar') return send(res, 200, { ok: true, data: await confirmarPedido(id), mensaje: 'Pedido confirmado, cupón aplicado y stock descontado.' });
      if (accion === 'cancelar') return send(res, 200, { ok: true, data: await cancelarPedido(id), mensaje: 'Pedido cancelado. Stock y cupón restaurados si correspondía.' });
      return error(res, 400, 'Acción inválida. Usa confirmar o cancelar.');
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
