const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const cloudinary = require('../services/cloudinary');

const router = express.Router();

// Dossier de stockage des médias
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safe = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo / fichier
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|gif|webp)$/.test(file.mimetype) || /^video\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  },
});

// POST /api/uploads — envoyer une ou plusieurs images/vidéos
router.post('/', protect, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });
    }

    // Tamponner l'icône OPTINET sur chaque image (si Cloudinary est configuré)
    if (cloudinary.isConfigured()) {
      await Promise.all(req.files.map(async (f) => {
        if (!/^image\//.test(f.mimetype)) return;
        try {
          const buf = await cloudinary.watermark(f.path);
          fs.writeFileSync(f.path, buf);
        } catch (e) {
          console.error('Watermark échoué pour', f.filename, ':', e.message); // on garde l'original
        }
      }));
    }

    const media = req.files.map(f => ({
      url: `/uploads/${f.filename}`,
      type: /^video\//.test(f.mimetype) ? 'video' : 'image',
      filename: f.filename,
      size: f.size,
    }));
    res.status(201).json({ success: true, media });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
