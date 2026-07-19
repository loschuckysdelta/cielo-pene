const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'api');
const deployable = fs.readdirSync(apiDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => `api/${entry.name}`);

console.log(`Funciones Vercel desplegables: ${deployable.length}`);
for (const file of deployable) console.log(`- ${file}`);

if (deployable.length > 12) {
  console.error('ERROR: El plan Hobby permite máximo 12 funciones directas por deployment.');
  process.exit(1);
}

console.log('Límite de funciones correcto. Los controladores internos están agrupados en una sola función dinámica.');
