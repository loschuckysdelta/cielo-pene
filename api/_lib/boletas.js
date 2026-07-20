const PDFDocument = require('pdfkit');
const { collection, memory, memoryId, publicDoc } = require('./db');

function money(value) {
  return `S/ ${(Number(value) || 0).toFixed(2)}`;
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function receiptNumber(order) {
  const code = clean(order?.codigo || '').replace(/[^A-Za-z0-9-]/g, '');
  return `B-${code || Date.now()}`;
}

function generateReceiptPdf(order, number) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Boleta ${number}`, Author: 'Cielo Postres' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pink = '#e93f78';
    const ink = '#242432';
    const muted = '#6f7282';
    const line = '#e7e7ee';

    doc.fillColor(pink).fontSize(24).font('Helvetica-Bold').text('Cielo Postres');
    doc.moveDown(0.2).fillColor(muted).fontSize(10).font('Helvetica').text('Boleta electrónica de compra');
    doc.moveDown(1);
    doc.strokeColor(line).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(1);

    const created = new Date(order?.createdAt || Date.now());
    doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text(`Boleta: ${number}`);
    doc.font('Helvetica').fillColor(muted).text(`Pedido: ${clean(order?.codigo || '-')}`);
    doc.text(`Fecha: ${created.toLocaleString('es-PE')}`);
    doc.moveDown(1);

    doc.fillColor(ink).font('Helvetica-Bold').text('Cliente');
    doc.font('Helvetica').fillColor(muted).text(clean(order?.cliente?.nombre || 'Cliente'));
    if (order?.cliente?.email) doc.text(clean(order.cliente.email));
    if (order?.cliente?.telefono) doc.text(clean(order.cliente.telefono));
    doc.text(order?.cliente?.entrega === 'delivery' ? 'Entrega: Delivery' : 'Entrega: Recojo en tienda');
    if (order?.cliente?.direccion) doc.text(`Dirección: ${clean(order.cliente.direccion)}`);
    doc.moveDown(1.2);

    const y = doc.y;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10);
    doc.text('Producto', 48, y, { width: 270 });
    doc.text('Cant.', 335, y, { width: 45, align: 'center' });
    doc.text('P. unit.', 395, y, { width: 65, align: 'right' });
    doc.text('Subtotal', 475, y, { width: 72, align: 'right' });
    doc.moveDown(0.5);
    doc.strokeColor(line).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.7);

    doc.font('Helvetica').fontSize(10);
    for (const item of order?.items || []) {
      const rowY = doc.y;
      const qty = Math.max(1, Number(item.cantidad || 1));
      const subtotal = Number(item.subtotal || 0);
      const unit = Number(item.precio || subtotal / qty || 0);
      doc.fillColor(ink).text(clean(item.nombre || 'Producto'), 48, rowY, { width: 270 });
      doc.fillColor(muted).text(String(qty), 335, rowY, { width: 45, align: 'center' });
      doc.text(money(unit), 395, rowY, { width: 65, align: 'right' });
      doc.fillColor(ink).text(money(subtotal), 475, rowY, { width: 72, align: 'right' });
      doc.y = Math.max(doc.y, rowY + 18);
    }

    doc.moveDown(0.5);
    doc.strokeColor(line).moveTo(320, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);
    if (Number(order?.descuento || 0) > 0) {
      doc.fillColor(muted).font('Helvetica').text('Descuento', 350, doc.y, { width: 110 });
      doc.fillColor(ink).text(`- ${money(order.descuento)}`, 475, doc.y - 12, { width: 72, align: 'right' });
      doc.moveDown(0.6);
    }
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('TOTAL', 350, doc.y, { width: 110 });
    doc.fillColor(pink).text(money(order?.total), 465, doc.y - 15, { width: 82, align: 'right' });

    doc.moveDown(2.5);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text('Gracias por tu compra. Conserva este archivo como constancia de tu pedido.', { align: 'center' });
    doc.text('Este documento es generado electrónicamente por la plataforma Cielo Postres.', { align: 'center' });
    doc.end();
  });
}

async function createReceipt(order) {
  const number = receiptNumber(order);
  const pdf = await generateReceiptPdf(order, number);
  const now = new Date().toISOString();
  const doc = {
    pedidoId: String(order?._id || order?.id || ''),
    clienteId: String(order?.clienteId || ''),
    numero: number,
    nombreArchivo: `boleta-${clean(order?.codigo || number)}.pdf`,
    mimeType: 'application/pdf',
    size: pdf.length,
    pdfBase64: pdf.toString('base64'),
    createdAt: now,
    updatedAt: now
  };
  const col = await collection('boletas');
  let saved;
  if (col) {
    const result = await col.insertOne(doc);
    saved = publicDoc({ ...doc, _id: result.insertedId });
  } else {
    if (!Array.isArray(memory.boletas)) memory.boletas = [];
    saved = { ...doc, id: memoryId() };
    memory.boletas.push(saved);
  }
  return saved;
}

module.exports = { createReceipt, generateReceiptPdf };
