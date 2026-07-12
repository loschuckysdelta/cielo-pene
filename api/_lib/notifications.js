const { collection, oid, publicDoc, memory, memoryId } = require('./db');

function firstName(value) {
  return String(value || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
}

function notificationContent(order, status) {
  const name = firstName(order?.cliente?.nombre);
  const code = order?.codigo || 'tu pedido';
  const pickup = order?.cliente?.entrega === 'recojo';
  const map = {
    pendiente: {
      title: 'Pedido recibido',
      message: `${name}, recibimos tu pedido ${code}. Te avisaremos cuando sea confirmado.`
    },
    confirmado: {
      title: 'Pedido confirmado',
      message: `${name}, tu pedido ${code} fue confirmado y pronto empezaremos a prepararlo.`
    },
    preparando: {
      title: 'Estamos preparando tu pedido',
      message: `${name}, tu pedido ${code} ya se está preparando.`
    },
    listo: pickup ? {
      title: 'Ya puedes recoger tu pedido',
      message: `${name}, tu pedido ${code} ya está listo. Ya puedes venir a recogerlo.`
    } : {
      title: 'Tu pedido está listo',
      message: `${name}, tu pedido ${code} ya está listo y pronto saldrá para delivery.`
    },
    en_camino: {
      title: 'Tu pedido está en camino',
      message: `${name}, tu pedido ${code} ya salió y está en camino.`
    },
    entregado: {
      title: 'Pedido entregado',
      message: `${name}, tu pedido ${code} fue entregado. ¡Gracias por comprar en Cielo Postres!`
    },
    cancelado: {
      title: 'Pedido cancelado',
      message: `${name}, tu pedido ${code} fue cancelado. Comunícate con la tienda si necesitas ayuda.`
    }
  };
  return map[status] || { title: 'Actualización de pedido', message: `${name}, tu pedido ${code} cambió de estado.` };
}

async function createNotification({ clienteId, orderId = '', orderCode = '', status = '', title, message, type = 'pedido' }) {
  if (!clienteId) return null;
  const col = await collection('notificaciones');
  const now = new Date().toISOString();
  const doc = {
    clienteId: String(clienteId),
    orderId: String(orderId || ''),
    orderCode: String(orderCode || ''),
    status: String(status || ''),
    type,
    title: String(title || 'Notificación'),
    message: String(message || ''),
    read: false,
    createdAt: now,
    updatedAt: now
  };

  if (col) {
    if (doc.orderId && doc.status) {
      const exists = await col.findOne({ clienteId: doc.clienteId, orderId: doc.orderId, status: doc.status, type: doc.type });
      if (exists) return publicDoc(exists);
    }
    const result = await col.insertOne(doc);
    return publicDoc({ ...doc, _id: result.insertedId });
  }

  if (!Array.isArray(memory.notificaciones)) memory.notificaciones = [];
  if (doc.orderId && doc.status) {
    const exists = memory.notificaciones.find(n => n.clienteId === doc.clienteId && n.orderId === doc.orderId && n.status === doc.status && n.type === doc.type);
    if (exists) return exists;
  }
  const saved = { ...doc, id: memoryId() };
  memory.notificaciones.push(saved);
  return saved;
}

async function createOrderNotification(order, status) {
  if (!order?.clienteId) return null;
  const content = notificationContent(order, status);
  return createNotification({
    clienteId: order.clienteId,
    orderId: String(order._id || order.id || ''),
    orderCode: order.codigo || '',
    status,
    title: content.title,
    message: content.message,
    type: 'pedido'
  });
}

module.exports = { notificationContent, createNotification, createOrderNotification };
