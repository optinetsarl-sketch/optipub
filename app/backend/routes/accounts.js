const express = require('express');
const SocialAccount = require('../models/SocialAccount');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Infos des plateformes
const PLATFORM_INFO = {
  facebook:          { label: 'Facebook',              icon: '📘', color: '#1877F2', api: 'Meta Graph API' },
  instagram:         { label: 'Instagram',             icon: '📸', color: '#dc2743', api: 'Meta Graph API' },
  linkedin:          { label: 'LinkedIn',              icon: '💼', color: '#0A66C2', api: 'Posts API' },
  x:                 { label: 'X (Twitter)',           icon: '𝕏',  color: '#000',    api: 'Twitter API v2' },
  tiktok:            { label: 'TikTok',                icon: '🎵', color: '#010101', api: 'Content Posting API' },
  whatsapp_status:   { label: 'WhatsApp Status',       icon: '💬', color: '#25D366', api: 'WhatsApp Business API' },
  whatsapp_channel:  { label: 'WhatsApp Business Channel', icon: '📢', color: '#128C7E', api: 'WhatsApp Business API' },
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
    // TODO: implémenter le refresh OAuth réel selon la plateforme
    account.status = 'connected';
    account.tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // +60 jours
    await account.save();
    res.json({ success: true, account, message: 'Token renouvelé' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/accounts/oauth/:platform — initier OAuth
router.get('/oauth/:platform', protect, (req, res) => {
  const platform = req.params.platform;
  const urls = {
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&scope=pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish&state=${req.user._id}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${process.env.LINKEDIN_REDIRECT_URI}&scope=w_member_social&state=${req.user._id}`,
    x: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${process.env.TWITTER_REDIRECT_URI}&scope=tweet.read+tweet.write+users.read&state=${req.user._id}&code_challenge=challenge&code_challenge_method=plain`,
    tiktok: `https://www.tiktok.com/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.upload&redirect_uri=${process.env.TIKTOK_REDIRECT_URI}&state=${req.user._id}`,
  };
  const url = urls[platform];
  if (!url) return res.status(400).json({ success: false, message: 'Plateforme OAuth non supportée' });
  res.json({ success: true, authUrl: url });
});

module.exports = router;
