const crypto = require('crypto');

const AUTHORIZATION_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const API_URL = 'https://api.x.com/2';
const STATE_TTL_MS = 10 * 60 * 1000;

class XOAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'XOAuthError';
    this.code = code;
  }
}

function createPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createState(userId, verifier) {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify({
    userId: String(userId),
    platform: 'x',
    verifier,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
}

function verifyState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) throw new XOAuthError('État OAuth X invalide ou expiré.');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
  const payload = Buffer.concat([
    decipher.update(Buffer.from(parts[2], 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const data = JSON.parse(payload);
  if (data.platform !== 'x' || !data.userId || !data.verifier || data.expiresAt < Date.now()) {
    throw new XOAuthError('État OAuth X invalide ou expiré. Relancez la connexion.');
  }
  return data;
}

function authorizationUrl(state, challenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TWITTER_CLIENT_ID || '',
    redirect_uri: process.env.TWITTER_REDIRECT_URI || '',
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

async function tokenRequest(params) {
  const credentials = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new XOAuthError(body.error_description || body.detail || `Échange OAuth X refusé (HTTP ${response.status}).`, body.error || response.status);
  }
  return body;
}

function exchangeCode(code, verifier) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.TWITTER_REDIRECT_URI || '',
    code_verifier: verifier,
  });
}

function refreshAccessToken(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function getUserInfo(accessToken) {
  const response = await fetch(`${API_URL}/users/me?user.fields=profile_image_url,public_metrics`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors) {
    throw new XOAuthError(body.detail || body.errors?.[0]?.message || `Lecture du profil X refusée (HTTP ${response.status}).`, body.errors?.[0]?.code || response.status);
  }
  if (!body.data?.id) throw new XOAuthError('X n’a pas renvoyé de profil pour ce compte.');
  return body.data;
}

module.exports = { XOAuthError, createPkce, createState, verifyState, authorizationUrl, exchangeCode, refreshAccessToken, getUserInfo };