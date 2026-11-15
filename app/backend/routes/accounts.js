const express = require('express');
const jwt = require('jsonwebtoken');
const SocialAccount = require('../models/SocialAccount');
const { protect } = require('../middleware/auth');
const facebook = require('../services/facebook');
const linkedin = require('../services/linkedin');
const xOAuth = require('../services/x');

const router = express.Router();

// Infos des plateformes
const PLATFORM_INFO = {
  facebook:          { label: 'Facebook',                    icon: '📘', color: '#1877F2', api: 'Meta Graph API' },
  facebook_personal: { label: 'Facebook — Profil Personnel',icon: '👤', color: '#1877F2', api: 'Meta Graph API' },
  instagram:         { label: 'Instagram',                   icon: '📸', color: '#dc2743', api: 'Meta Graph API' },
  linkedin:          { label: 'LinkedIn',                    icon: '💼', color: '#0A66C2', api: 'Posts API' },
  youtube:           { label: 'YouTube',                     icon: '▶️', color: '#FF0000', api: 'YouTube Data API v3' },
  x:                 { label: 'X (Twitter)',                 icon: '𝕏',  color: '#000',    api: 'Twitter API v2' },
  tiktok:            { label: 'TikTok',                      icon: '🎵', color: '#010101', api: 'Content Posting API' },
  whatsapp_status:   { label: 'WhatsApp Status',             icon: '💬', color: '#25D366', api: 'WhatsApp Business API' },
  whatsapp_channel:  { label: 'WhatsApp Business Channel',   icon: '📢', color: '#128C7E', api: 'WhatsApp Business API' },
  website:           { label: 'Site Web OPTINET',            icon: '🌐', color: '#007B9A', api: 'Site Web / Galerie' },
};

// GET /api/accounts — liste des comptes connectés
router.get('/', protect, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ userId: req.user._id });
    const connected = accounts.map(a => ({
      ...a.toObject(),
      platformInfo: PLATFORM_INFO[a.platform] || {},
    }));

    // Ajouter les plateformes non connectées
    const connectedPlatforms = accounts.map(a => a.platform);
    const all = Object.keys(PLATFORM_INFO).map(platform => {
      const existing = accounts.find(a => a.platform === platform);
      return existing
        ? { ...existing.toObject(), platformInfo: PLATFORM_INFO[platform] }
        : { platform, status: 'disconnected', platformInfo: PLATFORM_INFO[platform] };
    });

    res.json({ success: true, accounts: all });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/accounts — ajouter/connecter un compte (manuel ou via OAuth)
router.post('/', protect, async (req, res) => {
  try {
    const { platform, accountName, accountId, accessToken, refreshToken, tokenExpiresAt, followersCount, metadata } = req.body;

    const account = await SocialAccount.findOneAndUpdate(
      { userId: req.user._id, platform },
      { accountName, accountId, accessToken, refreshToken, tokenExpiresAt, followersCount, metadata, status: 'connected' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, account });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/accounts/:platform — déconnecter un compte
router.delete('/:platform', protect, async (req, res) => {
  try {
    await SocialAccount.findOneAndDelete({ userId: req.user._id, platform: req.params.platform });
    res.json({ success: true, message: `Compte ${req.params.platform} déconnecté` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/accounts/:platform/refresh — renouveler le token
router.put('/:platform/refresh', protect, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ userId: req.user._id, platform: req.params.platform });
    if (!account) return res.status(404).json({ success: false, message: 'Compte introuvable' });

    if (!['linkedin', 'x'].includes(account.platform)) {
      return res.status(409).json({
        success: false,
        requiresOAuth: true,
        message: `Le renouvellement automatique n'est pas disponible pour ${account.platform}. Reconnectez ce compte via OAuth.`,
      });
    }

    const refreshToken = account.metadata && account.metadata.refreshToken || account.refreshToken;
    if (!refreshToken) {
      return res.status(409).json({
        success: false,
        requiresOAuth: true,
        message: `Refresh token ${account.platform} absent. Une reconnexion OAuth est nécessaire.`,
      });
    }

    const refreshConfig = account.platform === 'linkedin'
      ? ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']
      : ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'];
    const missingConfig = refreshConfig.filter(key => !process.env[key]);
    if (missingConfig.length) {
      return res.status(503).json({
        success: false,
        message: `Configuration OAuth ${account.platform} incomplète. Variables manquantes : ${missingConfig.join(', ')}`,
      });
    }

    const tokens = account.platform === 'linkedin'
      ? await linkedin.refreshAccessToken(refreshToken)
      : await xOAuth.refreshAccessToken(refreshToken);
    account.accessToken = tokens.access_token;
    if (tokens.expires_in) account.tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    if (tokens.refresh_token) {
      account.refreshToken = tokens.refresh_token;
      account.metadata = { ...(account.metadata || {}), refreshToken: tokens.refresh_token };
    }
    account.status = 'connected';
    account.markModified('metadata');
    await account.save();

    res.json({
      success: true,
      account: {
        platform: account.platform,
        accountName: account.accountName,
        status: account.status,
        tokenExpiresAt: account.tokenExpiresAt,
      },
      message: `Token ${account.platform} renouvelé`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/accounts/website/connect — connecter le Site Web OPTINET
router.post('/website/connect', protect, async (req, res) => {
  try {
    const { apiUrl = 'http://localhost:8000', email = 'contact@optinet.tg', password = '' } = req.body || {};
    const account = await SocialAccount.findOneAndUpdate(
      { userId: req.user._id, platform: 'website' },
      {
        accountName: 'Site Web OPTINET (Galerie & Journal)',
        accountId: 'optinet-site',
        status: 'connected',
        metadata: {
          apiUrl,
          email,
          connectedAt: new Date().toISOString(),
          type: 'django_api',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, account, message: 'Site Web OPTINET connecté avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/accounts/facebook-personal/sync — activer le profil personnel depuis le compte Facebook connecté
router.post('/facebook-personal/sync', protect, async (req, res) => {
  try {
    const fbAccount = await SocialAccount.findOne({ userId: req.user._id, platform: 'facebook', status: 'connected' });
    if (!fbAccount || !fbAccount.accessToken) {
      return res.status(404).json({ success: false, message: 'Veuillez d’abord connecter votre compte Facebook.' });
    }
    let userName = 'Facebook Personnel';
    let userId = 'me';
    try {
      const me = await facebook.validateToken(fbAccount.accessToken);
      if (me && me.name) {
        userName = me.name + ' (Profil Perso)';
        userId = me.id;
      }
    } catch (_) {}

    const account = await SocialAccount.findOneAndUpdate(
      { userId: req.user._id, platform: 'facebook_personal' },
      {
        accountName: userName,
        accountId: userId,
        accessToken: fbAccount.accessToken,
        tokenExpiresAt: fbAccount.tokenExpiresAt,
        status: 'connected',
        metadata: {
          tokenType: 'user_profile',
          connectedAt: new Date().toISOString(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, account, message: 'Profil personnel Facebook synchronisé et connecté !' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/accounts/oauth/:platform — initier OAuth
router.get('/oauth/:platform', protect, (req, res) => {
  const platform = req.params.platform;
  const requiredConfig = {
    facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
    facebook_personal: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
    instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'],
    youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    x: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'TWITTER_REDIRECT_URI'],
    tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
  };
  const required = requiredConfig[platform];
  if (!required) return res.status(400).json({ success: false, message: 'Plateforme OAuth non supportée' });
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    return res.status(503).json({
      success: false,
      message: `Configuration OAuth ${platform} incomplète. Variables manquantes : ${missing.join(', ')}`,
      missingConfig: missing,
    });
  }
  const xPkce = platform === 'x' ? xOAuth.createPkce() : null;
  const oauthState = platform === 'x'
    ? xOAuth.createState(req.user._id, xPkce.verifier)
    : jwt.sign(
      { userId: String(req.user._id), platform },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
  const urls = {
    facebook: () => facebook.getOAuthUrl(oauthState),
    facebook_personal: () => facebook.getOAuthUrl(oauthState),
    instagram: () => facebook.getOAuthUrl(oauthState),
    linkedin: () => linkedin.authUrl(oauthState),
    youtube: () => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || process.env.YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email')}&access_type=offline&prompt=consent&state=${encodeURIComponent(oauthState)}`,
    x: () => xOAuth.authorizationUrl(oauthState, xPkce.challenge),
    tiktok: () => `https://www.tiktok.com/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.upload&redirect_uri=${process.env.TIKTOK_REDIRECT_URI}&state=${req.user._id}`,
  };
  // Chaque URL est construite seulement pour la plateforme demandée
  // (avant, l'URL X était construite à chaque fois et plantait pour les autres réseaux).
  const url = urls[platform]();
  res.json({ success: true, authUrl: url });
});

module.exports = router;
