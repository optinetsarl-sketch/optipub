// ──────────────────────────────────────────────────
//  Service de publication Facebook (Graph API réelle)
//  Doc: https://developers.facebook.com/docs/pages-api/posts
// ──────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Erreur portant le message renvoyé par l'API Facebook
class FacebookError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'FacebookError';
    this.details = details;
  }
}

async function graphJson(url, options) {
  const res = await fetch(url, options);
  let body;
  try { body = await res.json(); } catch { body = { raw: await res.text() }; }
  if (!res.ok || body.error) {
    const msg = body.error ? body.error.message : `HTTP ${res.status}`;
    throw new FacebookError(msg, body.error || body);
  }
  return body;
}

// Valide un token et renvoie l'identité { id, name }
async function validateToken(token) {
  return graphJson(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
}

// À partir d'un token utilisateur, récupère le token spécifique à la Page.
// Si le token fourni est déjà un token de Page, on le renvoie tel quel.
async function resolvePageToken(userToken, pageId) {
  try {
    const data = await graphJson(
      `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`
    );
    const page = (data.data || []).find(p => String(p.id) === String(pageId));
    if (page && page.access_token) return page.access_token;
  } catch (_) {
    // Le token est peut-être déjà un token de Page : on continue avec.
  }
  return userToken;
}

// Publie un post TEXTE sur le fil de la Page.
// Renvoie { id, permalink }
async function publishText({ pageId, token, message }) {
  const pageToken = await resolvePageToken(token, pageId);
  const params = new URLSearchParams({ message, access_token: pageToken });
  const body = await graphJson(`${GRAPH}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return { id: body.id, permalink: `https://www.facebook.com/${body.id}` };
}

// Publie UNE photo (avec légende) sur la Page.
// `image` = { url } (image publiquement accessible)  OU  { filePath } (fichier local)
// Renvoie { id, postId, permalink }
async function publishPhoto({ pageId, token, caption, image }) {
  const pageToken = await resolvePageToken(token, pageId);
  const endpoint = `${GRAPH}/${pageId}/photos`;
  let body;

  if (image && image.url) {
    const params = new URLSearchParams({ url: image.url, caption: caption || '', access_token: pageToken });
    body = await graphJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } else if (image && image.filePath) {
    const buf = fs.readFileSync(image.filePath);
    const form = new FormData();
    form.append('caption', caption || '');
    form.append('access_token', pageToken);
    form.append('source', new Blob([buf]), path.basename(image.filePath));
    body = await graphJson(endpoint, { method: 'POST', body: form });
  } else {
    throw new FacebookError('Aucune image fournie (url ou filePath requis)');
  }

  // body.post_id = id du post visible sur le fil ; body.id = id de la photo
  const postId = body.post_id || body.id;
  return { id: body.id, postId, permalink: `https://www.facebook.com/${postId}` };
}

// Publie plusieurs photos en un seul post (album/multi-photos).
// images = [{ url } | { filePath }]  →  renvoie { id, permalink }
async function publishMultiPhoto({ pageId, token, message, images }) {
  const pageToken = await resolvePageToken(token, pageId);

  // 1) Uploader chaque photo en mode "unpublished" pour récupérer son id
  const mediaFbids = [];
  for (const image of images) {
    const endpoint = `${GRAPH}/${pageId}/photos`;
    let body;
    if (image.url) {
      const params = new URLSearchParams({ url: image.url, published: 'false', access_token: pageToken });
      body = await graphJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } else if (image.filePath) {
      const buf = fs.readFileSync(image.filePath);
      const form = new FormData();
      form.append('published', 'false');
      form.append('access_token', pageToken);
      form.append('source', new Blob([buf]), path.basename(image.filePath));
      body = await graphJson(endpoint, { method: 'POST', body: form });
    } else {
      continue;
    }
    mediaFbids.push(body.id);
  }

  // 2) Créer le post attaché à toutes les photos
  const params = new URLSearchParams();
  params.append('message', message || '');
  params.append('access_token', pageToken);
  mediaFbids.forEach((fbid, i) => {
    params.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: fbid }));
  });
  const body = await graphJson(`${GRAPH}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return { id: body.id, permalink: `https://www.facebook.com/${body.id}` };
}

module.exports = {
  FacebookError,
  validateToken,
  resolvePageToken,
  publishText,
  publishPhoto,
  publishMultiPhoto,
};
