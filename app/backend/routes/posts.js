const express = require('express');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const { protect } = require('../middleware/auth');
const fbService = require('../services/facebook');
const igService = require('../services/instagram');
const liService = require('../services/linkedin');
const website = require('../services/website');
const cloudinary = require('../services/cloudinary');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');

// Récupère les chemins locaux des images d'un post (pour upload binaire)
function getPostImages(post) {
  return (post.media || [])
    .filter(m => m.type === 'image' && m.filename)
    .map(m => ({ filePath: path.join(uploadDir, m.filename) }))
    .filter(img => fs.existsSync(img.filePath));
}

// Publie le contenu sur UNE page (texte, 1 photo, ou album)
async function publishToOnePage(pageId, token, message, images) {
  if (images.length === 0) {
    return await fbService.publishText({ pageId, token, message });
  } else if (images.length === 1) {
    const r = await fbService.publishPhoto({ pageId, token, caption: message, image: images[0] });
    return { id: r.postId || r.id, permalink: r.permalink };
  } else {
    return await fbService.publishMultiPhoto({ pageId, token, message, images });
  }
}

// Publication réelle vers Facebook (une OU plusieurs Pages).
// Les pages cibles sont dans account.metadata.pages = [{id, name}, ...]
// (repli sur account.accountId si absent). Renvoie un tableau de résultats par page.
async function publishFacebook(post, account) {
  const message = adaptContent(post, 'facebook');
  const images = getPostImages(post);
  const token = account.accessToken;
  if (!token) throw new Error('Token Facebook manquant');

  const pages = (account.metadata && Array.isArray(account.metadata.pages) && account.metadata.pages.length)
    ? account.metadata.pages
    : [{ id: account.accountId, name: 'page' }];

  const results = [];
  for (const pg of pages) {
    try {
      const published = await publishToOnePage(pg.id, token, message, images);
      results.push({ page: pg.name, pageId: pg.id, id: published.id, permalink: published.permalink });
    } catch (e) {
      results.push({ page: pg.name, pageId: pg.id, error: e.message });
    }
  }
  return results;
}

// Publication réelle vers Instagram.
// Instagram exige des images accessibles publiquement -> on passe par Cloudinary,
// et on force un format 1:1 (padding blanc) pour respecter les contraintes IG.
async function publishInstagram(post, account) {
  const caption = adaptContent(post, 'instagram');
  const images = getPostImages(post);
  if (images.length === 0) throw new Error('Instagram exige au moins une image');
  if (!cloudinary.isConfigured()) throw new Error('Cloudinary non configuré (.env)');

  const igUserId = account.accountId;
  const token = account.accessToken;
  if (!igUserId) throw new Error('ID du compte Instagram manquant (accountId)');
  if (!token) throw new Error('Token Instagram manquant');

  // Upload vers Cloudinary + transformation 1:1 (padding blanc) pour Instagram
  const imageUrls = [];
  for (const img of images) {
    const up = await cloudinary.uploadFile(img.filePath, { folder: 'optipub/ig' });
    imageUrls.push(up.url.replace('/upload/', '/upload/c_pad,ar_1:1,b_white,w_1080/'));
  }

  return await igService.publish({ igUserId, token, imageUrls, caption });
}

// Publication réelle vers LinkedIn (texte + images, upload binaire direct)
async function publishLinkedIn(post, account) {
  const text = adaptContent(post, 'linkedin');
  const images = getPostImages(post);
  const authorUrn = account.metadata && account.metadata.authorUrn;
  if (!authorUrn) throw new Error('URN du profil LinkedIn manquant (reconnecter LinkedIn)');

  let token = account.accessToken;

  // Renouvellement automatique si le token est expiré (ou expire dans < 5 min)
  // et qu'un refresh_token est disponible — aucune action utilisateur requise.
  const expTs = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  const nearExpiry = !token || (expTs && expTs - Date.now() < 5 * 60 * 1000);
  const refreshToken = account.metadata && account.metadata.refreshToken;
  if (nearExpiry && refreshToken) {
    const nt = await liService.refreshAccessToken(refreshToken);
    token = nt.access_token;
    account.accessToken = nt.access_token;
    account.tokenExpiresAt = nt.expires_in ? new Date(Date.now() + nt.expires_in * 1000) : account.tokenExpiresAt;
    if (nt.refresh_token) account.metadata.refreshToken = nt.refresh_token;
    account.markModified('metadata');
    await account.save();
  }

  if (!token || (expTs && expTs < Date.now() && !refreshToken)) {
    throw new Error('Token LinkedIn expiré — reconnecter via http://localhost:5000/api/oauth/linkedin/start');
  }

  return await liService.publish({
    token, authorUrn, text,
    imageFilePaths: images.map(i => i.filePath),
  });
}

// Adaptation du contenu par plateforme
const adaptContent = (post, platform) => {
  const title = post.title;
  const content = post.content;
  const tags = post.hashtags.map(t => t.startsWith('#') ? t : '#' + t).join(' ');
  const link = post.externalLink ? `\n\n🔗 ${post.externalLink}` : '';
  const contact = '\n\n📞 +228 90 74 84 65 | optinetsarl@gmail.com'
    + '\n📢 Canal WhatsApp : https://whatsapp.com/channel/0029VbClEHFC1Fu7LWjyO11M'
    + '\n💬 Commander sur WhatsApp : https://wa.me/22890748465';

  switch (platform) {
    case 'facebook':
      return `🌐 ${title}\n\n${content}${link}${contact}\n\n${tags}`;
    case 'instagram':
      return `${title}\n\n${content}${contact}\n\n${tags}`;
    case 'linkedin':
      return `${title}\n\n${content}${link}${contact}\n\n✅ OPTINET SARLU — Solutions Tech, Togo\n\n${tags}`;
    case 'x':
      const maxX = 240;
      const textX = `${title} — ${post.shortContent || content}`.substring(0, maxX);
      return `${textX} ${tags.split(' ').slice(0, 3).join(' ')}`;
    case 'tiktok':
      return `${post.shortContent || content.substring(0, 150)} ${tags}`;
    case 'whatsapp_status':
      return `📢 *${title}*\n\n${post.shortContent || content.substring(0, 250)}\n\n📞 +228 90 74 84 65`;
    case 'whatsapp_channel':
      return `📣 *OPTINET SARLU*\n\n*${title}*\n\n${content}${link}${contact}\n\n${tags}`;
    default:
      return `${title}\n\n${content}`;
  }
};

// GET /api/posts — liste des publications
router.get('/', protect, async (req, res) => {
  try {
    const { status, platform, page = 1, limit = 20 } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    if (platform) filter.targetPlatforms = platform;

    const total = await Post.countDocuments(filter);
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), posts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/posts/stats — statistiques du dashboard
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const [total, published, scheduled, failed, draft] = await Promise.all([
      Post.countDocuments({ userId }),
      Post.countDocuments({ userId, status: 'published' }),
      Post.countDocuments({ userId, status: 'scheduled' }),
      Post.countDocuments({ userId, status: 'failed' }),
      Post.countDocuments({ userId, status: 'draft' }),
    ]);
    res.json({ success: true, stats: { total, published, scheduled, failed, draft } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/posts/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Publication introuvable' });
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/posts — créer une publication
router.post('/', protect, [
  body('title').notEmpty().withMessage('Le titre est requis'),
  body('content').notEmpty().withMessage('Le contenu est requis'),
  body('targetPlatforms').isArray({ min: 1 }).withMessage('Sélectionnez au moins une plateforme'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const {
      title, content, shortContent, hashtags, category, boutiqueCategorie,
      prix, quantiteDisponible,
      externalLink, targetPlatforms, status, scheduledAt, media
    } = req.body;

    // '' (champ vide) -> undefined, sinon nombre
    const qte = (quantiteDisponible === '' || quantiteDisponible == null)
      ? undefined : Math.max(0, Number(quantiteDisponible) || 0);

    // Construire les résultats par plateforme
    const platformResults = targetPlatforms.map(platform => ({
      platform,
      status: 'pending',
      adaptedContent: adaptContent({ title, content, shortContent, hashtags: hashtags || [], externalLink }, platform),
    }));

    const post = await Post.create({
      userId: req.user._id,
      title, content, shortContent, hashtags: hashtags || [],
      category, boutiqueCategorie, prix: prix || '', quantiteDisponible: qte,
      externalLink, targetPlatforms,
      media: Array.isArray(media) ? media : [],
      status: status || 'draft',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      platformResults,
    });

    // Si publication immédiate, simuler l'envoi (en prod, appeler les vraies APIs)
    if (status === 'published') {
      await publishToAllPlatforms(post, req.user._id);
    }

    res.status(201).json({ success: true, post });
  } catch (err) {
    console.error('❌ ERREUR POST /posts:', (err && err.stack) || err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/posts/actualite — Studio : publier une actualité (Le Journal) + réseaux
// body: { titre, contenu, categorie, videoUrl, media:[{type,filename}], destinations:[...] }
router.post('/actualite', protect, async (req, res) => {
  try {
    const { titre, contenu, categorie, service, videoUrl, media, destinations } = req.body;
    if (!titre) return res.status(400).json({ success: false, message: 'Le titre est requis' });

    const dests = Array.isArray(destinations) ? destinations : [];
    if (!dests.length) return res.status(400).json({ success: false, message: 'Sélectionnez au moins une destination' });

    // Post synthétique pour réutiliser la logique réseaux existante
    const synth = {
      title: titre,
      content: contenu || '',
      shortContent: (contenu || '').substring(0, 200),
      hashtags: ['OPTINET', 'OptinetSarlU', 'Togo', 'Lomé', 'Télécom', 'Réseau'],
      externalLink: videoUrl || '',
      media: Array.isArray(media) ? media : [],
    };
    const images = getPostImages(synth);
    const results = [];

    // ── Le Journal (site web) ──
    if (dests.includes('journal')) {
      const r = { platform: 'journal', status: 'failed', error: null };
      try {
        if (!images.length) throw new Error('Ajoutez au moins une photo');
        const out = await website.publishActualiteToSite({
          imageFilePaths: images.map(i => i.filePath),
          titre, contenu: contenu || '', categorie: categorie || 'intervention',
          service: service || '', videoUrl: videoUrl || '',
        });
        r.status = 'published';
        r.publishedUrl = (process.env.WEBSITE_API_URL || '').replace(/\/$/, '') + '/journal/' + out.id;
        r.platformPostId = String(out.id);
      } catch (e) { r.error = e.message; }
      results.push(r);
    }

    // ── Réseaux sociaux (en parallèle) ──
    const socialDests = dests.filter(d => ['facebook', 'instagram', 'linkedin'].includes(d));
    const socialResults = await Promise.all(socialDests.map(async (platform) => {
      const r = { platform, status: 'failed', error: null };
      try {
        const account = await SocialAccount.findOne({ userId: req.user._id, platform, status: 'connected' });
        if (!account) throw new Error(`Compte ${platform} non connecté`);
        if (platform === 'facebook') {
          const pr = await publishFacebook(synth, account);
          const oks = pr.filter(x => !x.error);
          r.status = oks.length ? 'published' : 'failed';
          r.publishedUrl = oks.map(x => x.permalink).filter(Boolean).join(' | ');
          const errs = pr.filter(x => x.error);
          if (errs.length) r.error = errs.map(x => `${x.page}: ${x.error}`).join(' | ');
        } else if (platform === 'instagram') {
          const published = await publishInstagram(synth, account);
          r.status = 'published'; r.publishedUrl = published.permalink;
        } else if (platform === 'linkedin') {
          const published = await publishLinkedIn(synth, account);
          r.status = 'published'; r.publishedUrl = published.permalink;
        }
      } catch (e) { r.error = e.message; }
      return r;
    }));
    results.push(...socialResults);

    const someOk = results.some(r => r.status === 'published');
    const allOk = results.every(r => r.status === 'published');

    // Enregistre la publication dans l'Historique (comme la page Créer) :
    // même si le téléphone perd la connexion avant la réponse, la trace
    // complète (statut + liens + erreurs par réseau) reste consultable.
    try {
      await Post.create({
        userId: req.user._id,
        title: titre,
        content: contenu || '(publication Studio)',
        shortContent: (contenu || '').substring(0, 200),
        hashtags: synth.hashtags,
        category: 'actu',
        externalLink: videoUrl || '',
        media: synth.media,
        targetPlatforms: dests,
        status: allOk ? 'published' : someOk ? 'partial' : 'failed',
        publishedAt: someOk ? new Date() : null,
        platformResults: results.map(r => ({
          platform: r.platform,
          status: r.status,
          publishedUrl: r.publishedUrl,
          platformPostId: r.platformPostId,
          errorMessage: r.error,
          publishedAt: r.status === 'published' ? new Date() : null,
        })),
      });
    } catch (e) {
      console.error('⚠️ Publication Studio réussie mais non enregistrée dans l\'historique:', e.message);
    }

    res.status(someOk ? 200 : 502).json({ success: someOk, results });
  } catch (err) {
    console.error('❌ ERREUR POST /posts/actualite:', (err && err.stack) || err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/posts/:id — modifier une publication
router.put('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Publication introuvable' });
    if (post.status === 'published') {
      return res.status(400).json({ success: false, message: 'Impossible de modifier une publication déjà publiée' });
    }

    const updatable = ['title', 'content', 'shortContent', 'hashtags', 'category', 'boutiqueCategorie',
                       'prix', 'quantiteDisponible',
                       'externalLink', 'targetPlatforms', 'status', 'scheduledAt', 'media'];
    updatable.forEach(field => { if (req.body[field] !== undefined) post[field] = req.body[field]; });

    // Recalculer l'adaptation
    if (req.body.targetPlatforms) {
      post.platformResults = req.body.targetPlatforms.map(platform => ({
        platform, status: 'pending',
        adaptedContent: adaptContent(post, platform),
      }));
    }
    await post.save();
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Publication introuvable' });
    res.json({ success: true, message: 'Publication supprimée' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/posts/:id/publish — publier maintenant
router.post('/:id/publish', protect, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Publication introuvable' });

    const results = await publishToAllPlatforms(post, req.user._id);
    res.json({ success: true, post, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/posts/:id/preview — aperçu par plateforme
router.get('/:id/preview', protect, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Publication introuvable' });

    const previews = {};
    const allPlatforms = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'whatsapp_status', 'whatsapp_channel'];
    allPlatforms.forEach(p => {
      previews[p] = adaptContent(post, p);
    });
    res.json({ success: true, previews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fonction de publication (simulation + appels réels selon config)
async function publishToAllPlatforms(post, userId) {
  // Publie UN seul réseau et renvoie son résultat (appelé en parallèle)
  async function publishOnePlatform(platform) {
    const result = { platform, status: 'failed', error: null };

    // ── Site web OPTINET (Galerie) — pas de compte social, config via .env ──
    if (platform === 'website') {
      try {
        const images = getPostImages(post);
        if (!images.length) { result.status = 'skipped'; result.error = 'Le site exige au moins une image'; return result; }
        if (!website.isConfigured()) { result.status = 'skipped'; result.error = 'Site non configuré (.env WEBSITE_*)'; return result; }
        const r = await website.publishToSite({
          imageFilePaths: images.map(i => i.filePath),
          titre: post.title,
          description: post.content,
          // priorité au prix saisi explicitement, sinon extraction depuis le texte
          prix: post.prix || website.extractPrix(post.content),
          quantite: post.quantiteDisponible,
          categorie: post.boutiqueCategorie || '',
        });
        result.status = 'published';
        result.publishedUrl = (process.env.WEBSITE_API_URL || '').replace(/\/$/, '') + '/galerie';
        result.platformPostId = 'photos:' + (r.ids || []).join(',');
        result.publishedAt = new Date();
      } catch (e) { result.status = 'failed'; result.error = e.message; }
      return result;
    }

    const account = await SocialAccount.findOne({ userId, platform, status: 'connected' });

    if (!account) {
      result.error = `Compte ${platform} non connecté`;
    } else if (platform === 'facebook') {
      // ── Intégration RÉELLE (une ou plusieurs Pages) ──
      try {
        const pageResults = await publishFacebook(post, account);
        const oks = pageResults.filter(r => !r.error);
        const errs = pageResults.filter(r => r.error);
        result.status = oks.length ? 'published' : 'failed';
        result.publishedUrl = oks.map(r => r.permalink).join(' | ');
        result.platformPostId = oks.map(r => r.id).join(',');
        result.error = errs.length ? errs.map(r => `${r.page}: ${r.error}`).join(' | ') : null;
        result.publishedAt = oks.length ? new Date() : null;
      } catch (e) {
        result.status = 'failed';
        result.error = e.message;
      }
    } else if (platform === 'instagram') {
      // ── Intégration RÉELLE Instagram ──
      try {
        const published = await publishInstagram(post, account);
        result.status = 'published';
        result.publishedUrl = published.permalink;
        result.platformPostId = published.id;
        result.publishedAt = new Date();
      } catch (e) {
        result.status = 'failed';
        result.error = e.message;
      }
    } else if (platform === 'linkedin') {
      // ── Intégration RÉELLE LinkedIn ──
      try {
        const published = await publishLinkedIn(post, account);
        result.status = 'published';
        result.publishedUrl = published.permalink;
        result.platformPostId = published.id;
        result.publishedAt = new Date();
      } catch (e) {
        result.status = 'failed';
        result.error = e.message;
      }
    } else {
      // ── SIMULATION (intégration réelle non encore implémentée) ──
      result.status = 'skipped';
      result.error = `Publication réelle non implémentée pour ${platform} (simulation)`;
    }

    return result;
  }

  // ── Publier tous les réseaux EN PARALLÈLE (au lieu d'un par un) ──
  const results = await Promise.all(post.targetPlatforms.map(publishOnePlatform));

  // Reporter les résultats dans le post
  for (const result of results) {
    const idx = post.platformResults.findIndex(r => r.platform === result.platform);
    if (idx >= 0) {
      post.platformResults[idx].status = result.status;
      post.platformResults[idx].publishedUrl = result.publishedUrl;
      post.platformResults[idx].platformPostId = result.platformPostId;
      post.platformResults[idx].errorMessage = result.error;
      post.platformResults[idx].publishedAt = result.publishedAt;
    }
  }

  const allOk = results.every(r => r.status === 'published');
  const someOk = results.some(r => r.status === 'published');
  post.status = allOk ? 'published' : someOk ? 'partial' : 'failed';
  if (allOk || someOk) post.publishedAt = new Date();
  await post.save();
  return results;
}

module.exports = router;
