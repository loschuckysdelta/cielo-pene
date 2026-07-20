const PDFDocument = require('pdfkit');
const { collection, memory, memoryId, publicDoc } = require('./db');

function money(value) { return `S/ ${(Number(value) || 0).toFixed(2)}`; }
function clean(value) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); }
function receiptNumber(order) {
  const code = clean(order?.codigo || '').replace(/[^A-Za-z0-9-]/g, '');
  return `B001-${(code || Date.now()).slice(-8).toUpperCase()}`;
}
async function loadReceiptConfig() {
  const defaults = {
    negocio: 'Cielo Postres', logoBoleta: 'https://i.postimg.cc/3JzmtRgP/image.png',
    tituloBoleta: 'BOLETA ELECTRÓNICA DE COMPRA', rucBoleta: '', telefonoBoleta: '',
    direccion: 'Celendín, Cajamarca - Perú', instagram: '', web: '', colorPrincipal: '#e93f78'
  };
  const col = await collection('configuracion');
  if (col) return { ...defaults, ...(await col.findOne({ clave: 'main' }) || {}) };
  return { ...defaults, ...(memory.configuracion || {}) };
}
async function imageFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url) || typeof fetch !== 'function') return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (_) { return null; }
}
function labelValue(doc, label, value, x, y, width = 230) {
  doc.fillColor('#242432').font('Helvetica-Bold').fontSize(9).text(label, x, y, { width: 82 });
  doc.fillColor('#555866').font('Helvetica').text(clean(value || '-'), x + 82, y, { width: width - 82 });
}
async function generateReceiptPdf(order, number, config = {}) {
  const logo = await imageFromUrl(config.logoBoleta);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Boleta ${number}`, Author: clean(config.negocio || 'Cielo Postres') } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pink = /^#[0-9a-f]{6}$/i.test(config.colorPrincipal || '') ? config.colorPrincipal : '#e93f78';
    const ink = '#242432', muted = '#666978', line = '#eadde3', pale = '#fff3f7';
    const left = 36, right = 559, width = right - left;

    doc.roundedRect(left, 32, width, 112, 12).fillAndStroke('#ffffff', line);
    if (logo) { try { doc.image(logo, 50, 47, { fit: [82, 82], align: 'center', valign: 'center' }); } catch (_) {} }
    const brandX = logo ? 145 : 52;
    doc.fillColor(pink).font('Helvetica-Bold').fontSize(22).text(clean(config.negocio || 'Cielo Postres'), brandX, 49, { width: 235 });
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(clean(config.direccion || ''), brandX, 79, { width: 235 });
    if (config.telefonoBoleta) doc.text(`Teléfono: ${clean(config.telefonoBoleta)}`, brandX, 94, { width: 235 });
    if (config.instagram) doc.text(`Instagram: ${clean(config.instagram)}`, brandX, 109, { width: 235 });

    doc.roundedRect(386, 45, 157, 86, 10).fillAndStroke(pale, pink);
    doc.fillColor(pink).font('Helvetica-Bold').fontSize(12).text(clean(config.tituloBoleta || 'BOLETA ELECTRÓNICA'), 397, 56, { width: 135, align: 'center' });
    if (config.rucBoleta) doc.fillColor(ink).fontSize(9).text(`RUC: ${clean(config.rucBoleta)}`, 397, 76, { width: 135, align: 'center' });
    doc.fillColor(muted).font('Helvetica').fontSize(8).text('N.º DE BOLETA', 397, 92, { width: 135, align: 'center' });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(14).text(number, 397, 105, { width: 135, align: 'center' });

    const created = new Date(order?.createdAt || Date.now());
    const yInfo = 160;
    doc.roundedRect(left, yInfo, 250, 100, 10).fillAndStroke('#ffffff', line);
    doc.roundedRect(309, yInfo, 250, 100, 10).fillAndStroke('#ffffff', line);
    doc.roundedRect(left, yInfo, 250, 27, 10).fill(pale);
    doc.roundedRect(309, yInfo, 250, 27, 10).fill(pale);
    doc.fillColor(pink).font('Helvetica-Bold').fontSize(10).text('DATOS DEL CLIENTE', 49, 169);
    doc.text('DETALLE DEL PEDIDO', 322, 169);
    labelValue(doc, 'Nombre:', order?.cliente?.nombre, 49, 197);
    labelValue(doc, 'Correo:', order?.cliente?.email, 49, 216);
    labelValue(doc, 'Teléfono:', order?.cliente?.telefono, 49, 235);
    labelValue(doc, 'Pedido:', order?.codigo, 322, 197);
    labelValue(doc, 'Entrega:', order?.cliente?.entrega === 'delivery' ? 'Delivery' : 'Recojo en tienda', 322, 216);
    labelValue(doc, 'Fecha:', created.toLocaleString('es-PE'), 322, 235);

    let y = 278;
    const cols = [left, 66, 315, 376, 462, right];
    doc.roundedRect(left, y, width, 31, 8).fill(pink);
    const headers = [['#', left, 30, 'center'], ['PRODUCTO', 66, 249, 'left'], ['CANT.', 315, 61, 'center'], ['P. UNIT.', 376, 86, 'right'], ['SUBTOTAL', 462, 97, 'right']];
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    headers.forEach(([t, x, w, a]) => doc.text(t, x, y + 10, { width: w, align: a }));
    y += 31;
    doc.font('Helvetica').fontSize(9);
    (order?.items || []).forEach((item, index) => {
      if (y > 650) { doc.addPage(); y = 45; }
      const rowH = 34, qty = Math.max(1, Number(item.cantidad || 1));
      const subtotal = Number(item.subtotal || 0), unit = Number(item.precio || subtotal / qty || 0);
      if (index % 2 === 0) doc.rect(left, y, width, rowH).fill('#fffafb');
      doc.strokeColor(line).lineWidth(0.5).moveTo(left, y + rowH).lineTo(right, y + rowH).stroke();
      doc.fillColor(ink).text(String(index + 1), left, y + 11, { width: 30, align: 'center' });
      doc.font('Helvetica-Bold').text(clean(item.nombre || 'Producto'), 74, y + 7, { width: 235 });
      doc.font('Helvetica').fillColor(muted).text(clean(item.categoriaNombre || ''), 74, y + 19, { width: 235 });
      doc.fillColor(ink).text(String(qty), 315, y + 11, { width: 61, align: 'center' });
      doc.text(money(unit), 376, y + 11, { width: 78, align: 'right' });
      doc.font('Helvetica-Bold').text(money(subtotal), 462, y + 11, { width: 88, align: 'right' });
      y += rowH;
    });

    y += 16;
    doc.roundedRect(left, y, 245, 105, 10).fillAndStroke('#ffffff', line);
    doc.roundedRect(309, y, 250, 105, 10).fillAndStroke('#ffffff', line);
    doc.fillColor(pink).font('Helvetica-Bold').fontSize(10).text('MÉTODO DE PAGO', 49, y + 14);
    labelValue(doc, 'Método:', order?.metodoPago || 'Efectivo', 49, y + 40, 220);
    labelValue(doc, 'Estado:', order?.metodoPago === 'Efectivo' ? 'Pendiente al recibir' : 'Comprobante enviado', 49, y + 61, 220);
    labelValue(doc, 'Fecha:', created.toLocaleDateString('es-PE'), 49, y + 82, 220);

    const delivery = Number(order?.delivery?.precio || 0);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text('Subtotal productos:', 326, y + 20, { width: 130 });
    doc.fillColor(ink).text(money(order?.subtotal), 465, y + 20, { width: 78, align: 'right' });
    doc.fillColor(muted).text('Costo de delivery:', 326, y + 39, { width: 130 });
    doc.fillColor(ink).text(money(delivery), 465, y + 39, { width: 78, align: 'right' });
    doc.fillColor(muted).text('Descuento:', 326, y + 58, { width: 130 });
    doc.fillColor(ink).text(`- ${money(order?.descuento)}`, 465, y + 58, { width: 78, align: 'right' });
    doc.strokeColor(pink).moveTo(326, y + 77).lineTo(543, y + 77).stroke();
    doc.fillColor(pink).font('Helvetica-Bold').fontSize(12).text('TOTAL:', 326, y + 84, { width: 90 });
    doc.fontSize(18).text(money(order?.total), 420, y + 80, { width: 123, align: 'right' });

    y += 122;
    doc.roundedRect(left, y, width, 48, 10).fill(pale);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('¡Gracias por tu compra!', 49, y + 10);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text('Conserva esta boleta como constancia de tu pedido. Documento generado electrónicamente.', 49, y + 27, { width: 480 });
    doc.end();
  });
}

async function createReceipt(order) {
  const number = receiptNumber(order);
  const config = await loadReceiptConfig();
  const pdf = await generateReceiptPdf(order, number, config);
  const now = new Date().toISOString();
  const doc = {
    pedidoId: String(order?._id || order?.id || ''), clienteId: String(order?.clienteId || ''),
    numero: number, nombreArchivo: `boleta-${clean(order?.codigo || number)}.pdf`, mimeType: 'application/pdf',
    size: pdf.length, pdfBase64: pdf.toString('base64'), createdAt: now, updatedAt: now
  };
  const col = await collection('boletas');
  let saved;
  if (col) { const result = await col.insertOne(doc); saved = publicDoc({ ...doc, _id: result.insertedId }); }
  else { if (!Array.isArray(memory.boletas)) memory.boletas = []; saved = { ...doc, id: memoryId() }; memory.boletas.push(saved); }
  return saved;
}
module.exports = { createReceipt, generateReceiptPdf };
