// ──────────────────────────────────────────────────
//  Téléchargement des sauvegardes (protégé par BACKUP_TOKEN)
//  Le dossier /backups du conteneur est monté depuis
//  /home/hugue/backups (rempli chaque vendredi par backup-db.sh).
// ──────────────────────────────────────────────────
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';

// Vérifie le jeton en temps constant (en-tête x-backup-token)
function verifToken(req, res, next) {
  const attendu = process.env.BACKUP_TOKEN || '';
  const recu = String(req.headers['x-backup-token'] || '');
  if (!attendu) return res.status(503).json({ success: false, message: 'BACKUP_TOKEN non configuré (.env)' });
  const a = crypto.createHash('sha256').update(attendu).digest();
  const b = crypto.createHash('sha256').update(recu).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ success: false, message: 'Jeton invalide' });
  next();
}

// GET /api/backup — liste des fichiers disponibles
router.get('/', verifToken, (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) {
    return res.json({ success: true, files: [], message: 'Aucune sauvegarde encore générée' });
  }
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^[\w.-]+\.(gz|zip)$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, mtime: st.mtime };
    })
    .sort((x, y) => new Date(y.mtime) - new Date(x.mtime));
  res.json({ success: true, files });
});

// GET /api/backup/download/:name — télécharge un fichier
router.get('/download/:name', verifToken, (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[\w.-]+\.(gz|zip)$/.test(name) || name.includes('..')) {
    return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
  }
  const filePath = path.join(BACKUP_DIR, name);
  if (!filePath.startsWith(BACKUP_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Fichier introuvable' });
  }
  res.download(filePath, name);
});

module.exports = router;
