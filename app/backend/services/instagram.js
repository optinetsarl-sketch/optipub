// ──────────────────────────────────────────────────
//  Service de publication Instagram (Graph API réelle)
//  Flux : créer un conteneur média -> publier
//  Doc: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//  NB: les images doivent être accessibles via une URL PUBLIQUE (Cloudinary).
// ──────────────────────────────────────────────────
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

class InstagramError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'InstagramError';
    this.details = details;
  }
}

async function graphPost(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  let j; try { j = await res.json(); } catch { j = {}; }
  if (!res.ok || j.error) {
    throw new InstagramError(j.error ? j.error.message : `HTTP ${res.status}`, j.error);
  }
  return j;
}

async function graphGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  let j; try { j = await res.json(); } catch { j = {}; }
  if (!res.ok || j.error) {
    throw new InstagramError(j.error ? j.error.message : `HTTP ${res.status}`, j.error);
  }
  return j;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Attend que le conteneur soit prêt à publier (status_code = FINISHED)
async function waitReady(containerId, token, { tries = 10, delay = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const j = await graphGet(`${containerId}`, { fields: 'status_code', access_token: token });
    if (j.status_code === 'FINISHED') return true;
    if (j.status_code === 'ERROR') throw new InstagramError('Le conteneur média est en ERROR');
    await sleep(delay);
  }
  return true; // on tente le publish quand même
}

async function getPermalink(mediaId, token) {
  try {
    const j = await graphGet(`${mediaId}`, { fields: 'permalink', access_token: token });
    return j.permalink;
  } catch { return null; }
}

// Publie une seule image. Renvoie { id, permalink }
async function publishSingle({ igUserId, token, imageUrl, caption }) {
  const container = await graphPost(`${igUserId}/media`, {
    image_url: imageUrl, caption: caption || '', access_token: token,
  });
  await waitReady(container.id, token);
  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: container.id, access_token: token,
  });
  return { id: published.id, permalink: await getPermalink(published.id, token) };
}

// Publie un carrousel (2 à 10 images). Renvoie { id, permalink }
async function publishCarousel({ igUserId, token, imageUrls, caption }) {
  const childIds = [];
  for (const url of imageUrls) {
    const child = await graphPost(`${igUserId}/media`, {
      image_url: url, is_carousel_item: 'true', access_token: token,
    });
    await waitReady(child.id, token);
    childIds.push(child.id);
  }
  const container = await graphPost(`${igUserId}/media`, {
    media_type: 'CAROUSEL', children: childIds.join(','), caption: caption || '', access_token: token,
  });
  await waitReady(container.id, token);
  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: container.id, access_token: token,
  });
  return { id: published.id, permalink: await getPermalink(published.id, token) };
}

// Aiguillage selon le nombre d'images (max 10 en carrousel)
async function publish({ igUserId, token, imageUrls, caption }) {
  if (!imageUrls || imageUrls.length === 0) {
    throw new InstagramError('Instagram exige au moins une image');
  }
  const urls = imageUrls.slice(0, 10);
  if (urls.length === 1) return publishSingle({ igUserId, token, imageUrl: urls[0], caption });
  return publishCarousel({ igUserId, token, imageUrls: urls, caption });
}

module.exports = { InstagramError, publish, publishSingle, publishCarousel };
