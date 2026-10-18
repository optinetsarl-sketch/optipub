const express = require('express');
const jwt = require('jsonwebtoken');
const SocialAccount = require('../models/SocialAccount');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const linkedin = require('../services/linkedin');
const youtube = require('../services/youtube');

const router = express.Router();

// GET /api/oauth/youtube/start — démarre le flux OAuth Google/YouTube
router.get('/youtube/start', protect, (req, res) => {
  if (!youtube.isConfigured()) {
    return res.status(500).send('<h2>Configuration manquante</h2><p>Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REDIRECT_URI dans le .env local.</p>');
  }
  const state = jwt.sign(
    { userId: String(req.user._id), platform: 'youtube' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
  res.redirect(youtube.authUrl(state));
});

// GET /api/oauth/youtube/callback — Google renvoie ici avec ?code=...
router.get('/youtube/callback', async (req, res) => {
  const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#ff0000">${body}</body></html>`;
  try {
    const { code, error, error_description, state } = req.query;
    if (error) return res.send(page('Erreur YouTube', `<h2>Erreur Google</h2><p>${error} — ${error_description || ''}</p>`));
    if (!code) return res.send(page('Erreur', '<h2>Code manquant</h2>'));

    const oauthState = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    if (oauthState.platform !== 'youtube' || !oauthState.userId) {
      throw new Error('État OAuth YouTube invalide ou expiré. Relancez la connexion.');
    }
    const user = await User.findById(oauthState.userId);
    if (!user) throw new Error('Utilisateur OPTIPUB introuvable. Relancez la connexion.');

    const tokens = await youtube.exchangeCode(code);
    const profile = await youtube.getUserInfo(tokens.access_token);

    let acc = await SocialAccount.findOne({ platform: 'youtube', userId: user?._id });
    if (!acc) acc = new SocialAccount({ userId: user._id, platform: 'youtube' });
    acc.userId = user._id;
    acc.accountName = profile.name || 'YouTube';
    acc.accountId = profile.id || null;
    acc.accessToken = tokens.access_token;
    acc.refreshToken = tokens.refresh_token || acc.refreshToken;
    acc.status = 'connected';
    acc.tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    acc.metadata = {
      channel: profile.email || null,
      tokenType: 'oauth',
      connectedAt: new Date().toISOString(),
      refreshToken: tokens.refresh_token || null,
    };
    acc.markModified('metadata');
    await acc.save();

    res.send(page('YouTube connecté', `<h1>✅ YouTube connecté !</h1><p>Compte : <b>${profile.name || 'Google'}</b></p><p>Tu peux fermer cet onglet et revenir sur OPTIPUB.</p>`));
  } catch (e) {
    res.status(500).send(page('Erreur', `<h2>Erreur</h2><p>${e.message}</p>`));
  }
});

// GET /api/oauth/linkedin/start — démarre le flux (redirige vers LinkedIn)
router.get('/linkedin/start', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  res.redirect(linkedin.authUrl(state));
});

// GET /api/oauth/linkedin/callback — LinkedIn renvoie ici avec ?code=...
router.get('/linkedin/callback', async (req, res) => {
  const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#0a66c2">
    ${body}</body></html>`;
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.send(page('Erreur', `<h2>Erreur LinkedIn</h2><p>${error} — ${error_description || ''}</p>`));
    if (!code) return res.send(page('Erreur', '<h2>Code manquant</h2>'));

    const tok = await linkedin.exchangeCode(code);
    const info = await linkedin.getUserInfo(tok.access_token);
    const authorUrn = `urn:li:person:${info.sub}`;

    const user = await User.findOne({ role: 'admin' }) || await User.findOne();
    let acc = await SocialAccount.findOne({ platform: 'linkedin' });
    if (!acc) acc = new SocialAccount({ userId: user._id, platform: 'linkedin' });
    acc.userId = user._id;
    acc.accountName = info.name || 'LinkedIn';
    acc.accountId = info.sub;
    acc.accessToken = tok.access_token;
    acc.status = 'connected';
    acc.tokenExpiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null;
    acc.metadata = {
      authorUrn, tokenType: 'oauth', scope: tok.scope,
      refreshToken: tok.refresh_token || null,
      refreshTokenExpiresAt: tok.refresh_token_expires_in ? new Date(Date.now() + tok.refresh_token_expires_in * 1000).toISOString() : null,
      connectedAt: new Date().toISOString(),
    };
    acc.markModified('metadata');
    await acc.save();

    const hasRefresh = Boolean(tok.refresh_token);
    res.send(page('LinkedIn connecté', `
      <h1>✅ LinkedIn connecté !</h1>
      <p>Compte : <b>${info.name || ''}</b></p>
      <p style="color:${hasRefresh ? '#0a7d2c' : '#b26b00'}">${hasRefresh
        ? '♻️ Refresh token reçu : renouvellement automatique activé (aucun reclic pendant ~1 an).'
        : '⚠️ Pas de refresh token fourni par LinkedIn : reconnexion manuelle tous les ~2 mois.'}</p>
      <p style="color:#333">Tu peux fermer cet onglet et revenir sur Claude.</p>`));
  } catch (e) {
    res.status(500).send(page('Erreur', `<h2>Erreur</h2><p>${e.message}</p>`));
  }
});

module.exports = router;
