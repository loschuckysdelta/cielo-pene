const { MongoClient, ObjectId } = require('mongodb');

let clientPromise;
let memory = global.__ANTOJA2_MEMORY__;
if (!memory) {
  memory = global.__ANTOJA2_MEMORY__ = {
    categorias: [],
    productos: [],
    configuracion: null,
    delivery: [],
    cupones: [],
    pedidos: [],
    resenas: [],
    usuarios: []
  };
}

function hasMongo() {
  return Boolean(process.env.MONGO_URI && process.env.MONGO_URI.startsWith('mongodb'));
}

async function getClient() {
  if (!hasMongo()) return null;
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function db() {
  const client = await getClient();
  if (!client) return null;
  const dbName = process.env.MONGO_DB_NAME || 'antoja2';
  return client.db(dbName);
}

async function collection(name) {
  const database = await db();
  if (!database) return null;
  return database.collection(name);
}

function oid(id) {
  if (!id) return null;
  try { return new ObjectId(String(id)); } catch (_) { return null; }
}

function publicDoc(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  if (copy._id) copy.id = String(copy._id);
  delete copy._id;
  return copy;
}

function publicList(list) {
  return (list || []).map(publicDoc);
}

function memoryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function ensureIndexes() {
  const database = await db();
  if (!database) return;
  await Promise.all([
    database.collection('productos').createIndex({ categoriaId: 1 }),
    database.collection('productos').createIndex({ nombre: 1, categoriaNombre: 1 }),
    database.collection('pedidos').createIndex({ createdAt: -1 }),
    database.collection('cupones').createIndex({ codigo: 1 }, { unique: true }),
    database.collection('resenas').createIndex({ createdAt: -1 }),
    database.collection('resenas').createIndex({ estado: 1, createdAt: -1 }),
    database.collection('usuarios').createIndex({ email: 1 }, { unique: true }),
    database.collection('usuarios').createIndex({ role: 1, activo: 1 })
  ]).catch(() => null);
}

module.exports = { hasMongo, db, collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes };
