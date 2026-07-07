require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const connectDB = require('./config/db');

const app = express();

// ── Connexion MongoDB Atlas ──────────────────────
connectDB();

// ── Middleware ───────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Routes API ───────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/posts',    require('./routes/posts'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/hashtags', require('./routes/hashtags'));
app.use('/api/uploads',  require('./routes/uploads'));
app.use('/api/oauth',    require('./routes/oauth'));

// ── Médias uploadés ──────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Santé de l'API ───────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    app: 'OPTIPUB — Publish Everywhere',
    company: 'OPTINET SARLU — Solutions Tech',
    version: '1.0.0',
    status: 'running',
    time: new Date().toISOString(),
  });
});

// ── Servir le Frontend ───────────────────────────
const frontendPath = path.join(__dirname, '../frontend/public');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Tâche CRON : publications programmées ────────
// Vérifier toutes les minutes les publications à envoyer
cron.schedule('* * * * *', async () => {
  try {
    const Post = require('./models/Post');
    const now = new Date();
    const duePosts = await Post.find({
      status: 'scheduled',
      scheduledAt: { $lte: now },
    });

    for (const post of duePosts) {
      console.log(`⏰ Publication programmée: ${post.title}`);
      post.status = 'publishing';
      await post.save();
      // Déclencher la publication (même logique que /publish)
      // Dans une version production, utiliser une file de messages (Bull, RabbitMQ)
    }
  } catch (err) {
    console.error('Erreur CRON:', err.message);
  }
});

// ── Démarrage ────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   OPTIPUB — Publish Everywhere           ║');
  console.log('║   OPTINET SARLU — Solutions Tech         ║');
  console.log(`║   Serveur démarré sur le port ${PORT}        ║`);
  console.log('║   http://localhost:' + PORT + '               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
