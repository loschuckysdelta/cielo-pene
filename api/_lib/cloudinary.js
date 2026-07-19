let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
} catch (_) {
  cloudinary = null;
}

function configured() {
  return Boolean(
    cloudinary &&
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function setup() {
  if (!configured()) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  return true;
}

async function uploadBase64(dataUrl, folder = 'antoja2_productos') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (!setup()) return dataUrl;

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: 'image',
    overwrite: false
  });
  return result.secure_url;
}

async function uploadBase64WithMeta(dataUrl, folder = 'cielo_postres') {
  if (!dataUrl || typeof dataUrl !== 'string') return { url: '', publicId: '' };
  if (!dataUrl.startsWith('data:image/')) return { url: dataUrl, publicId: '' };
  if (!setup()) return { url: dataUrl, publicId: '' };
  const result = await cloudinary.uploader.upload(dataUrl, { folder, resource_type: 'image', overwrite: false });
  return { url: result.secure_url, publicId: result.public_id };
}

async function destroy(publicId) {
  if (!publicId || !setup()) return false;
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
  return true;
}

async function uploadMany(list) {
  const urls = [];
  for (const img of list || []) {
    const uploaded = await uploadBase64(img);
    if (uploaded) urls.push(uploaded);
  }
  return urls.slice(0, 5);
}

module.exports = { configured, uploadBase64, uploadBase64WithMeta, destroy, uploadMany };
