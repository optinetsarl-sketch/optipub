// ──────────────────────────────────────────────────
//  Service LinkedIn (OAuth 2.0 + publication ugcPosts)
//  Doc: https://learn.microsoft.com/linkedin/marketing/integrations/community-management/shares/ugc-post-api
//  Portée requise : w_member_social (publier), openid/profile (identité)
// ──────────────────────────────────────────────────
const fs = require('fs');

const API = 'https://api.linkedin.com';
const OAUTH = 'https://www.linkedin.com/oauth/v2';

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT = process.env.LINKEDIN_REDIRECT_URI;

class LinkedInError extends Error {
  constructor(message, details) { super(message); this.name = 'LinkedInError'; this.details = details; }
}

// URL d'autorisation OAuth
function authUrl(state) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'openid profile email w_member_social',
    state,
  });
  return `${OAUTH}/authorization?${p.toString()}`;
}

// Échange du code contre un access_token
async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT,
  });
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new LinkedInError(j.error_description || j.error || 'échange de code échoué', j);
  return j; // { access_token, expires_in, scope }
}

// Renouvelle l'access_token via un refresh_token (sans interaction utilisateur)
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: refreshToken,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new LinkedInError(j.error_description || j.error || 'refresh échoué', j);
  return j; // { access_token, expires_in, refresh_token?, refresh_token_expires_in? }
}

// Identité (OpenID) -> { sub, name, email, ... }
async function getUserInfo(token) {
  const res = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (!res.ok) throw new LinkedInError('userinfo échoué', j);
  return j;
}

// Enregistre un upload d'image -> { uploadUrl, asset }
async function registerImageUpload(token, ownerUrn) {
  const res = await fetch(`${API}/v2/assets?action=registerUpload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: ownerUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    }),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new LinkedInError('registerUpload échoué', j);
  const uploadUrl = j.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  return { uploadUrl, asset: j.value.asset };
}

// Upload binaire de l'image vers l'URL fournie par LinkedIn
async function uploadImageBinary(uploadUrl, token, buffer) {
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new LinkedInError(`upload image échoué (${res.status}) ${t}`);
  }
}

// Crée le post (ugcPost). Renvoie { id, permalink }
async function createUgcPost({ token, authorUrn, text, assetUrns }) {
  const hasImages = assetUrns && assetUrns.length > 0;
  const share = {
    shareCommentary: { text },
    shareMediaCategory: hasImages ? 'IMAGE' : 'NONE',
  };
  if (hasImages) share.media = assetUrns.map(a => ({ status: 'READY', media: a }));

  const res = await fetch(`${API}/v2/ugcPosts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': share },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok || j.error) throw new LinkedInError(j.message || `ugcPost échoué (${res.status})`, j);
  const id = j.id || res.headers.get('x-restli-id');
  return { id, permalink: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
}

// Publie texte + images (upload binaire direct, pas besoin de Cloudinary)
async function publish({ token, authorUrn, text, imageFilePaths }) {
  const assetUrns = [];
  if (imageFilePaths && imageFilePaths.length) {
    for (const fp of imageFilePaths.slice(0, 9)) {
      const { uploadUrl, asset } = await registerImageUpload(token, authorUrn);
      await uploadImageBinary(uploadUrl, token, fs.readFileSync(fp));
      assetUrns.push(asset);
    }
  }
  return createUgcPost({ token, authorUrn, text, assetUrns });
}

module.exports = { LinkedInError, authUrl, exchangeCode, refreshAccessToken, getUserInfo, registerImageUpload, uploadImageBinary, createUgcPost, publish };
