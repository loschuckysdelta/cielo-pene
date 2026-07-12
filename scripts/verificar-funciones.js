const fs = require('fs');
const path = require('path');
const apiDir = path.join(__dirname, '..', 'api');
const files = fs.readdirSync(apiDir).filter(name => name.endsWith('.js'));
console.log(`Funciones Vercel detectadas: ${files.length}`);
for (const file of files) console.log(`- api/${file}`);
if (files.length > 12) {
  console.error('ERROR: El plan Hobby permite máximo 12 funciones directas por deployment.');
  process.exit(1);
}
console.log('OK: compatible con el límite del plan Hobby.');
