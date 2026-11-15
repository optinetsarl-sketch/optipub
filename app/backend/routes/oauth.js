const express = require('express');
const jwt = require('jsonwebtoken');
const SocialAccount = require('../models/SocialAccount');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const facebook = require('../services/facebook');
const linkedin = require('../services/linkedin');
const xOAuth = require('../services/x');
const youtube = require('../services/youtube');

const router = express.Router();

function connectedPage(title, message, color = '#333') {
  const returnUrl = process.env.OPTIPUB_RETURN_URL || 'http://localhost:5000';
  const safeReturnUrl = returnUrl.replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[character]);
  const scriptUrl = JSON.stringify(returnUrl).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px;color:${color}">${message}<p><a href="${safeReturnUrl}">Retourner à OPTIPUB</a></p><script>setTimeout(() => window.location.replace(${scriptUrl}), 1500)</script></body></html>`;
}

router.get('/x/callback', async (req, res) => {
  const page = (title, message) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">${message}</body></html>`;
  try {
    const { code, error, state } = req.query;
    if (error) return res.status(400).send(page('X non connecté', 'Autorisation refusée. Retournez dans OPTIPUB et relancez la connexion.'));
    if (!code) return res.status(400).send(page('X non connecté', 'Code OAuth manquant. Relancez la connexion depuis OPTIPUB.'));

    const oauthState = xOAuth.verifyState(state);
    const user = await User.findById(oauthState.userId);
    if (!user) return res.status(400).send(page('X non connecté', 'Utilisateur OPTIPUB introuvable. Relancez la connexion.'));

    const tokens = await xOAuth.exchangeCode(String(code), oauthState.verifier);
    const profile = await xOAuth.getUserInfo(tokens.access_token);
    const account = await SocialAccount.findOneAndUpdate(
      { userId: user._id, platform: 'x' },
      {
        accountName: profile.name || profile.username || 'X',
        accountId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        status: 'connected',
        metadata: {
          username: profile.username || null,
          profilePicture: profile.profile_image_url || null,
          tokenType: 'oauth2',
          scope: tokens.scope || null,
          refreshToken: tokens.refresh_token || null,
          connectedAt: new Date().toISOString(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    account.markModified('metadata');
    await account.save();

    res.send(connectedPage('X connecté', `<h1>✅ X connecté</h1><p>Compte : <b>${profile.name || profile.username || 'X'}</b></p><p>Retour vers OPTIPUB…</p>`, '#000'));
  } catch (error) {
    const message = error instanceof xOAuth.XOAuthError ? error.message : 'État OAuth invalide ou expiré. Relancez la connexion depuis OPTIPUB.';
    const safeMessage = String(message).slice(0, 240).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[character]);
    console.error('X OAuth callback failed:', error.name || 'Error', error.code || '');
    res.status(400).send(page('X connexion échouée', `Diagnostic X : ${safeMessage}`));
  }
});

router.get('/facebook/callback', async (req, res) => {
  const page = (title, message) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">${message}</body></html>`;
  try {
    const { code, error, state } = req.query;
    if (error) return res.status(400).send(page('Facebook non connecté', 'Autorisation refusée. Retournez dans OPTIPUB et relancez la connexion.'));
    if (!code) return res.status(400).send(page('Facebook non connecté', 'Code OAuth manquant. Relancez la connexion depuis OPTIPUB.'));

    const oauthState = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    if (!['facebook', 'instagram', 'facebook_personal'].includes(oauthState.platform) || !oauthState.userId) {
      return res.status(400).send(page('Facebook non connecté', 'État OAuth invalide ou expiré. Relancez la connexion depuis OPTIPUB.'));
    }
    const user = await User.findById(oauthState.userId);
    if (!user) return res.status(400).send(page('Facebook non connecté', 'Utilisateur OPTIPUB introuvable. Relancez la connexion.'));

    const shortToken = await facebook.exchangeOAuthCode(String(code));
    const longToken = await facebook.exchangeLongLivedToken(shortToken.access_token);
    const pages = await facebook.getManagedPages(longToken.access_token).catch(() => []);
    const expiry = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000) : null;

    // Récupérer le profil personnel Facebook (nom, id)
    let personalProfile = null;
    try {
      personalProfile = await facebook.validateToken(longToken.access_token);
    } catch (_) {}

    // Si demande explicite de connecter le profil personnel
    if (oauthState.platform === 'facebook_personal') {
      const pName = personalProfile?.name ? `${personalProfile.name} (Profil Perso)` : 'Facebook (Profil Personnel)';
      const pId = personalProfile?.id || 'me';
      const personalAccount = await SocialAccount.findOneAndUpdate(
        { userId: user._id, platform: 'facebook_personal' },
        {
          accountName: pName,
          accountId: pId,
          accessToken: longToken.access_token,
          refreshToken: null,
          tokenExpiresAt: expiry,
          status: 'connected',
          metadata: {
            tokenType: 'user_profile',
            userName: personalProfile?.name || null,
            connectedAt: new Date().toISOString(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      personalAccount.markModified('metadata');
      await personalAccount.save();
      return res.send(connectedPage('Facebook Perso connecté', `<h1>✅ Profil Facebook connecté</h1><p>Compte : <b>${pName}</b></p><p>Retour vers OPTIPUB…</p>`, '#1877f2'));
    }

    if (!pages.length && oauthState.platform === 'facebook') {
      return res.status(400).send(page('Aucune Page Facebook', 'Aucune Page administrable n’a été trouvée. Vérifiez les droits accordés à OPTIPUB.'));
    }

    const existingInstagram = await SocialAccount.findOne({ userId: user._id, platform: 'instagram' });
    const instagramPages = pages.filter(item => item.instagram_business_account && item.instagram_business_account.id);
    const instagramPage = instagramPages.find(item => String(item.instagram_business_account.id) === String(existingInstagram?.accountId)) || instagramPages[0];

    if (oauthState.platform === 'facebook' && pages.length) {
      const account = await SocialAccount.findOneAndUpdate(
        { userId: user._id, platform: 'facebook' },
        {
          accountName: pages[0].name || 'Facebook Page',
          accountId: pages[0].id,
          accessToken: longToken.access_token,
          refreshToken: null,
          tokenExpiresAt: expiry,
          status: 'connected',
          metadata: {
            tokenType: 'long_lived_user',
            pages: pages.map(item => ({ id: item.id, name: item.name })),
            connectedAt: new Date().toISOString(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      account.markModified('metadata');
      await account.save();

      // Synchroniser aussi automatiquement le profil personnel Facebook
      if (personalProfile && personalProfile.name) {
        try {
          const personalAccount = await SocialAccount.findOneAndUpdate(
            { userId: user._id, platform: 'facebook_personal' },
            {
              accountName: `${personalProfile.name} (Profil Perso)`,
              accountId: personalProfile.id || 'me',
              accessToken: longToken.access_token,
              tokenExpiresAt: expiry,
              status: 'connected',
              metadata: {
                tokenType: 'user_profile',
                userName: personalProfile.name,
                connectedAt: new Date().toISOString(),
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          personalAccount.markModified('metadata');
          await personalAccount.save();
        } catch (_) {}
      }
    }

    if (oauthState.platform === 'instagram' && !instagramPage) {
      return res.status(400).send(page('Instagram non disponible', 'Aucun compte Instagram Business lié aux Pages autorisées n’a été trouvé.'));
    }

    if (instagramPage && (oauthState.platform === 'instagram' || oauthState.platform === 'facebook')) {
      const instagram = instagramPage.instagram_business_account;
      const account = await SocialAccount.findOneAndUpdate(
        { userId: user._id, platform: 'instagram' },
        {
          accountName: instagram.username || instagramPage.name || 'Instagram Business',
          accountId: instagram.id,
          accessToken: instagramPage.access_token || longToken.access_token,
          refreshToken: null,
          tokenExpiresAt: null,
          status: 'connected',
          metadata: {
            tokenType: 'page',
            pageId: instagramPage.id,
            pageName: instagramPage.name || null,
            connectedAt: new Date().toISOString(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      account.markModified('metadata');
      await account.save();
    }

    const connected = oauthState.platform === 'facebook' ? 'Facebook' : 'Instagram';
    res.send(connectedPage(`${connected} connecté`, `<h1>✅ ${connected} connecté</h1><p>Retour vers OPTIPUB…</p>`, '#1877f2'));
  } catch (error) {
    const diagnostic = error instanceof facebook.FacebookError ? error.message : error.name || 'Erreur OAuth';
    const safeDiagnostic = String(diagnostic).slice(0, 240).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[character]);
    console.error('Meta OAuth callback failed:', error.name || 'Error', error.code || error.details?.code || '');
    res.status(400).send(page('Connexion Meta échouée', `La reconnexion a échoué. Diagnostic Meta : ${safeDiagnostic}. Vérifiez les autorisations puis relancez OAuth depuis OPTIPUB.`));
  }
});

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
    const channel = await youtube.getChannelInfo(tokens.access_token);

    let acc = await SocialAccount.findOne({ platform: 'youtube', userId: user?._id });
    if (!acc) acc = new SocialAccount({ userId: user._id, platform: 'youtube' });
    acc.userId = user._id;
    acc.accountName = channel.title || 'YouTube';
    acc.accountId = channel.id || null;
    acc.accessToken = tokens.access_token;
    acc.refreshToken = tokens.refresh_token || acc.refreshToken;
    acc.status = 'connected';
    acc.tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    acc.metadata = {
      channel: channel.title || null,
      channelId: channel.id || null,
      tokenType: 'oauth',
      connectedAt: new Date().toISOString(),
      refreshToken: tokens.refresh_token || null,
    };
    acc.markModified('metadata');
    await acc.save();

    res.send(connectedPage('YouTube connecté', `<h1>✅ YouTube connecté !</h1><p>Chaîne : <b>${channel.title || 'YouTube'}</b></p><p>Retour vers OPTIPUB…</p>`, '#ff0000'));
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
    const { code, error, error_description, state } = req.query;
    if (error) return res.send(page('Erreur', `<h2>Erreur LinkedIn</h2><p>${error} — ${error_description || ''}</p>`));
    if (!code) return res.send(page('Erreur', '<h2>Code manquant</h2>'));

    const oauthState = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    if (oauthState.platform !== 'linkedin' || !oauthState.userId) {
      throw new Error('État OAuth LinkedIn invalide ou expiré. Relancez la connexion.');
    }
    const user = await User.findById(oauthState.userId);
    if (!user) throw new Error('Utilisateur OPTIPUB introuvable. Relancez la connexion.');

    const tok = await linkedin.exchangeCode(code);
    const info = await linkedin.getUserInfo(tok.access_token);
    const authorUrn = `urn:li:person:${info.sub}`;

    let acc = await SocialAccount.findOne({ platform: 'linkedin', userId: user._id });
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
    res.send(connectedPage('LinkedIn connecté', `
      <h1>✅ LinkedIn connecté !</h1>
      <p>Compte : <b>${info.name || ''}</b></p>
      <p style="color:${hasRefresh ? '#0a7d2c' : '#b26b00'}">${hasRefresh
        ? '♻️ Refresh token reçu : renouvellement automatique activé (aucun reclic pendant ~1 an).'
        : '⚠️ Pas de refresh token fourni par LinkedIn : reconnexion manuelle tous les ~2 mois.'}</p>
      <p>Retour vers OPTIPUB…</p>`, '#0a66c2'));
  } catch (e) {
    res.status(500).send(page('Erreur', `<h2>Erreur</h2><p>${e.message}</p>`));
  }
});

module.exports = router;
