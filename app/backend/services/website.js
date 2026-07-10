// ──────────────────────────────────────────────────
//  Service : pousser les photos vers le site OPTINET (Django REST)
//  - login JWT (/api/login/)
//  - upload photo dans la Galerie (/api/photos/create/)
// ──────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const API = (process.env.WEBSITE_API_URL || '').replace(/\/$/, '');
const EMAIL = process.env.WEBSITE_EMAIL;
const PASSWORD = process.env.WEBSITE_PASSWORD;

function isConfigured() {
  return Boolean(API && EMAIL && PASSWORD);
}

// Récupère un token d'accès JWT du site
async function login() {
  const res = await fetch(`${API}/api/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await res.json();
  if (!res.ok || !j.access) throw new Error(`Site: login échoué (${res.status})`);
  return j.access;
}

// Envoie une image dans la Galerie du site. Renvoie { id, url }
async function pushPhoto({ token, filePath, titre, description, prix }) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('image_principale', new Blob([buf], { type: 'image/jpeg' }), path.basename(filePath));
  if (titre) form.append('titre', titre);
  if (description) form.append('description', description);
  if (prix) form.append('prix', prix);
  form.append('est_actif', 'true');
  const res = await fetch(`${API}/api/photos/create/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok) throw new Error(`Site: upload photo échoué (${res.status}) ${JSON.stringify(j).slice(0, 150)}`);
  return { id: j.id, url: j.image_principale };
}

// Crée UN produit boutique avec toutes ses photos. Renvoie { id, count }
async function pushProduit({ token, imageFilePaths, nom, description, prix, quantite, caracteristiques, categorie }) {
  const form = new FormData();
  form.append('nom', nom || 'Produit OPTINET');
  if (description) form.append('description', description);
  if (prix) form.append('prix', prix);
  if (quantite !== undefined && quantite !== null && quantite !== '') form.append('quantite_disponible', String(quantite));
  if (caracteristiques) form.append('caracteristiques', caracteristiques);
  if (categorie) form.append('categorie', categorie);
  form.append('est_actif', 'true');
  for (const fp of imageFilePaths) {
    const buf = fs.readFileSync(fp);
    form.append('images', new Blob([buf], { type: 'image/jpeg' }), path.basename(fp));
  }
  const res = await fetch(`${API}/api/produits/create/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok) throw new Error(`Site: création produit échouée (${res.status}) ${JSON.stringify(j).slice(0, 150)}`);
  return { id: j.id, count: (j.photos || []).length };
}

// Publie un ARTICLE = 1 produit boutique avec toutes ses photos.
// Renvoie { count, ids }
async function publishToSite({ imageFilePaths, titre, description, prix, quantite, caracteristiques, categorie }) {
  if (!isConfigured()) throw new Error('Site non configuré (.env WEBSITE_*)');
  if (!imageFilePaths || !imageFilePaths.length) throw new Error('Le site exige au moins une image');
  const token = await login();
  const r = await pushProduit({
    token, imageFilePaths, nom: titre, description, prix, quantite, caracteristiques, categorie,
  });
  return { count: r.count, ids: [r.id], produitId: r.id };
}

// Crée UNE actualité (Le Journal) avec toutes ses photos. Renvoie { id, count }
async function pushActualite({ token, imageFilePaths, titre, contenu, categorie, service, videoUrl }) {
  const form = new FormData();
  form.append('titre', titre || 'Actualité OPTINET');
  if (contenu) form.append('contenu', contenu);
  form.append('categorie', categorie || 'intervention');
  if (service) form.append('service', service);
  if (videoUrl) form.append('video_url', videoUrl);
  form.append('est_publie', 'true');
  for (const fp of (imageFilePaths || [])) {
    const buf = fs.readFileSync(fp);
    form.append('images', new Blob([buf], { type: 'image/jpeg' }), path.basename(fp));
  }
  const res = await fetch(`${API}/api/actualites/create/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok) throw new Error(`Site: création actualité échouée (${res.status}) ${JSON.stringify(j).slice(0, 150)}`);
  return { id: j.id, count: (j.photos || []).length };
}

// Publie une actualité sur le site (Le Journal). Renvoie { id, count }
async function publishActualiteToSite({ imageFilePaths, titre, contenu, categorie, service, videoUrl }) {
  if (!isConfigured()) throw new Error('Site non configuré (.env WEBSITE_*)');
  const token = await login();
  const r = await pushActualite({ token, imageFilePaths, titre, contenu, categorie, service, videoUrl });
  return { id: r.id, count: r.count };
}

// Extrait un prix du texte (ex: "Prix: 210 000 FCFA")
function extractPrix(text) {
  const m = /prix\s*:?\s*([0-9][0-9\s.,]*(?:\s*(?:FCFA|F\s?CFA|XOF|F))?)/i.exec(text || '');
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

module.exports = { isConfigured, login, pushPhoto, pushProduit, publishToSite, pushActualite, publishActualiteToSite, extractPrix };
