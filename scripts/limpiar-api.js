const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'api');
const keep = new Set(['router.js']);

if (!fs.existsSync(apiDir)) {
  console.error('ERROR: No existe la carpeta api.');
  process.exit(1);
}

const removed = [];
for (const entry of fs.readdirSync(apiDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js') || keep.has(entry.name)) continue;
  fs.unlinkSync(path.join(apiDir, entry.name));
  removed.push(entry.name);
}

if (removed.length) {
  console.log(`API antiguas eliminadas del build: ${removed.length}`);
  for (const name of removed) console.log(`- api/${name}`);
} else {
  console.log('No se encontraron API antiguas duplicadas.');
}
