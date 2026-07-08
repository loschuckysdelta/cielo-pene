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

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

async function getCoupon(cuponesCol, codigo) {
  if (!codigo) return null;
  const code = normalizeText(codigo).toUpperCase();
  if (!code) return null;
  if (cuponesCol) return cuponesCol.findOne({ codigo: code, activo: true });
  return memory.cupones.find(c => c.codigo === code && c.activo) || null;
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
    if ((Number(prod.stock) || 0) < cantidad) {
      throw new Error(`Stock insuficiente para ${prod.nombre}. Stock actual: ${prod.stock}.`);
    }

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

  const cupon = await getCoupon(cuponesCol, body.cupon || cliente.cupon);
  let descuento = 0;
  let cuponCodigo = '';
  if (cupon) {
    cuponCodigo = cupon.codigo;
    descuento = cupon.tipo === 'monto' ? money(cupon.valor) : money(subtotal * (Number(cupon.valor) / 100));
    descuento = Math.min(descuento, subtotal);
  }

  const total = money(subtotal + deliveryPrecio - descuento);

  return {
    codigo: orderCode(),
    cliente: {
      nombre,
      telefono,
      entrega,
      direccion,
      zonaId: zona ? String(zona._id || zona.id) : '',
      zonaNombre: zona ? zona.nombre : '',
      nota
    },
    items,
    subtotal,
    delivery: {
      texto: deliveryTexto,
      zonaId: zona ? String(zona._id || zona.id) : '',
      zonaNombre: zona ? zona.nombre : '',
      precio: deliveryPrecio,
      porCoordinar: zona ? zona.tipoPrecio === 'coordinar' : false
    },
    cupon: cuponCodigo,
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

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.estado === 'confirmado' && pedido.stockDescontado) return publicDoc(pedido);
    if (pedido.estado === 'cancelado') throw new Error('No puedes confirmar un pedido cancelado.');

    const historial = [];
    const aplicados = [];
    for (const item of pedido.items || []) {
      const pid = oid(item.productoId);
      if (!pid) throw new Error(`Producto inválido en pedido: ${item.nombre}`);
      const prod = await productosCol.findOne({ _id: pid });
      if (!prod) throw new Error(`Producto no encontrado: ${item.nombre}`);
      const stockActual = Number(prod.stock) || 0;
      const qty = Number(item.cantidad) || 0;
      if (stockActual < qty) throw new Error(`Stock insuficiente para ${prod.nombre}. Stock actual: ${stockActual}, pedido: ${qty}.`);

      const r = await productosCol.updateOne({ _id: pid, stock: { $gte: qty } }, { $inc: { stock: -qty }, $set: { updatedAt: new Date().toISOString() } });
      if (r.modifiedCount !== 1) {
        for (const rollback of aplicados) {
          await productosCol.updateOne({ _id: rollback._id }, { $inc: { stock: rollback.qty }, $set: { activo: true, updatedAt: new Date().toISOString() } });
        }
        throw new Error(`No se pudo descontar stock de ${prod.nombre}. Intenta otra vez.`);
      }
      const nuevo = await productosCol.findOne({ _id: pid });
      if ((Number(nuevo.stock) || 0) <= 0) {
        await productosCol.updateOne({ _id: pid }, { $set: { activo: false, updatedAt: new Date().toISOString() } });
      }
      aplicados.push({ _id: pid, qty });
      historial.push({ productoId: String(pid), nombre: prod.nombre, cantidad: qty, stockAntes: stockActual, stockDespues: Math.max(0, stockActual - qty), fecha: new Date().toISOString() });
    }

    await pedidosCol.updateOne({ _id }, { $set: { estado: 'confirmado', stockDescontado: true, historialStock: historial, updatedAt: new Date().toISOString() } });
    const actualizado = await pedidosCol.findOne({ _id });
    return publicDoc(actualizado);
  }

  const i = memory.pedidos.findIndex(p => p.id === id);
  if (i < 0) throw new Error('Pedido no encontrado.');
  const pedido = memory.pedidos[i];
  if (pedido.estado === 'confirmado' && pedido.stockDescontado) return pedido;
  if (pedido.estado === 'cancelado') throw new Error('No puedes confirmar un pedido cancelado.');
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
  memory.pedidos[i] = { ...pedido, estado: 'confirmado', stockDescontado: true, historialStock: historial, updatedAt: new Date().toISOString() };
  return memory.pedidos[i];
}

async function cancelarPedido(id) {
  const pedidosCol = await collection('pedidos');
  const productosCol = await collection('productos');

  if (pedidosCol) {
    const _id = oid(id);
    if (!_id) throw new Error('ID de pedido inválido.');
    const pedido = await pedidosCol.findOne({ _id });
    if (!pedido) throw new Error('Pedido no encontrado.');
    if (pedido.estado === 'cancelado') return publicDoc(pedido);

    if (pedido.stockDescontado) {
      for (const item of pedido.items || []) {
        const pid = oid(item.productoId);
        if (pid) {
          await productosCol.updateOne({ _id: pid }, { $inc: { stock: Number(item.cantidad) || 0 }, $set: { activo: true, updatedAt: new Date().toISOString() } });
        }
      }
    }
    await pedidosCol.updateOne({ _id }, { $set: { estado: 'cancelado', stockDescontado: false, updatedAt: new Date().toISOString() } });
    const actualizado = await pedidosCol.findOne({ _id });
    return publicDoc(actualizado);
  }

  const i = memory.pedidos.findIndex(p => p.id === id);
  if (i < 0) throw new Error('Pedido no encontrado.');
  const pedido = memory.pedidos[i];
  if (pedido.stockDescontado) {
    for (const item of pedido.items || []) {
      const prod = memory.productos.find(p => p.id === item.productoId);
      if (prod) {
        prod.stock = (Number(prod.stock) || 0) + (Number(item.cantidad) || 0);
        prod.activo = true;
      }
    }
  }
  memory.pedidos[i] = { ...pedido, estado: 'cancelado', stockDescontado: false, updatedAt: new Date().toISOString() };
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
      if (accion === 'confirmar') {
        const doc = await confirmarPedido(id);
        return send(res, 200, { ok: true, data: doc, mensaje: 'Pedido confirmado y stock descontado.' });
      }
      if (accion === 'cancelar') {
        const doc = await cancelarPedido(id);
        return send(res, 200, { ok: true, data: doc, mensaje: 'Pedido cancelado. Si el stock fue descontado, se restauró.' });
      }
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
