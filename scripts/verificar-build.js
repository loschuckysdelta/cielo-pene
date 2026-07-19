const fs = require('fs');
const path = require('path');

const required = [
  'public/index.html',
  'public/admin.html',
  'public/cuenta.html',
  'vercel.json'
];

const missing = required.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));
if (missing.length) {
  console.error('Faltan archivos obligatorios:', missing.join(', '));
  process.exit(1);
}

console.log('Cielo Postres: archivos web y configuración verificados correctamente.');
