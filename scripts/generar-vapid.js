const crypto = require('crypto');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey(null, 'uncompressed').toString('base64url');
const privateKey = ecdh.getPrivateKey().toString('base64url');

console.log('VAPID_PUBLIC_KEY=' + publicKey);
console.log('VAPID_PRIVATE_KEY=' + privateKey);
console.log('VAPID_SUBJECT=mailto:admin@cielopostres.com');
