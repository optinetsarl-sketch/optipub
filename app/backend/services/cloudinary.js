// ──────────────────────────────────────────────────
//  Service d'upload Cloudinary (signé, sans SDK)
//  Sert à héberger publiquement les images pour Instagram.
//  Doc: https://cloudinary.com/documentation/image_upload_api_reference
// ──────────────────────────────────────────────────
const fs = require('fs');
const crypto = require('crypto');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function isConfigured() {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

// Signature Cloudinary : sha1( params triés "k=v&..." + api_secret )
function sign(params) {
  const toSign = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');
}

// Upload d'un fichier local -> renvoie l'URL publique (secure_url)
// options: { folder, publicId, overwrite }
async function uploadFile(filePath, options = {}) {
  if (!isConfigured()) throw new Error('Cloudinary non configuré (.env)');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder !== undefined ? options.folder : 'optipub';

  // Paramètres à signer (hors file, api_key, resource_type)
  const signParams = { timestamp };
  if (folder) signParams.folder = folder;
  if (options.publicId) signParams.public_id = options.publicId;
  if (options.overwrite) signParams.overwrite = 'true';
  const signature = sign(signParams);

  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), require('path').basename(filePath));
  form.append('api_key', API_KEY);
  form.append('timestamp', String(timestamp));
  if (folder) form.append('folder', folder);
  if (options.publicId) form.append('public_id', options.publicId);
  if (options.overwrite) form.append('overwrite', 'true');
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const j = await res.json();
  if (!res.ok || j.error) {
    throw new Error(`Cloudinary: ${j.error ? j.error.message : 'HTTP ' + res.status}`);
  }
  return { url: j.secure_url, publicId: j.public_id, width: j.width, height: j.height };
}

// Upload de plusieurs fichiers -> tableau d'URLs publiques
async function uploadMany(filePaths, options = {}) {
  const urls = [];
  for (const p of filePaths) {
    const r = await uploadFile(p, options);
    urls.push(r.url);
  }
  return urls;
}

// ── Watermark : tamponne l'icône OPTINET (haut-gauche) sur une image ──
const path = require('path');
const WM_PUBLIC_ID = 'optipub_watermark_icon';
const WM_SOURCE = path.join(__dirname, '..', '..', 'frontend', 'public', 'assets', 'logo-icon.png');
// Position/taille/opacité du filigrane (icône, coin haut-gauche) + qualité MAX (q_100)
// pour ne PAS dégrader la photo lors du re-encodage.
const WM_TRANSFORM = `l_${WM_PUBLIC_ID},g_north_west,w_0.14,fl_relative,o_92,x_25,y_25/q_100`;
let _wmEnsured = false;

// S'assure que l'icône filigrane est bien présente sur Cloudinary (upload une fois)
async function ensureWatermark() {
  if (_wmEnsured) return;
  await uploadFile(WM_SOURCE, { folder: '', publicId: WM_PUBLIC_ID, overwrite: true });
  _wmEnsured = true;
}

// Applique le filigrane sur un fichier image local -> renvoie le Buffer de l'image tamponnée
async function watermark(filePath) {
  if (!isConfigured()) throw new Error('Cloudinary non configuré');
  await ensureWatermark();
  const up = await uploadFile(filePath, { folder: 'optipub/wm' });
  const url = up.url.replace('/upload/', '/upload/' + WM_TRANSFORM + '/');
  const r = await fetch(url);
  if (!r.ok) throw new Error('watermark fetch ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { isConfigured, uploadFile, uploadMany, ensureWatermark, watermark };
