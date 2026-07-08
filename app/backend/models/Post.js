const mongoose = require('mongoose');

// Résultat de publication sur une plateforme
const PlatformResultSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  status: { type: String, enum: ['pending', 'published', 'failed', 'skipped'], default: 'pending' },
  adaptedContent: { type: String },
  publishedUrl: { type: String },
  platformPostId: { type: String },
  errorMessage: { type: String },
  publishedAt: { type: Date },
}, { _id: false });

const PostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true
  },
  title: { type: String, required: [true, 'Le titre est requis'], trim: true, maxlength: 500 },
  content: { type: String, required: [true, 'Le contenu est requis'] },
  shortContent: { type: String, maxlength: 5000 },
  hashtags: [{ type: String }],
  category: {
    type: String,
    enum: ['offre', 'actu', 'emploi', 'event', 'tech', 'promo', 'comm'],
    default: 'actu'
  },
  // Catégorie de la boutique (slug côté site : ordinateurs, telephones, reseau-wifi, accessoires...)
  // Utilisée uniquement quand la destination "website" est sélectionnée.
  boutiqueCategorie: { type: String, trim: true },
  media: [{
    url: { type: String },
    type: { type: String, enum: ['image', 'video'] },
    filename: { type: String },
    size: { type: Number },
  }],
  externalLink: { type: String },
  targetPlatforms: [{
    type: String,
    enum: ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'whatsapp_status', 'whatsapp_channel', 'website']
  }],
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'partial', 'failed'],
    default: 'draft'
  },
  scheduledAt: { type: Date },
  publishedAt: { type: Date },
  platformResults: [PlatformResultSchema],

  // Statistiques globales (agrégées depuis les plateformes)
  stats: {
    totalReach: { type: Number, default: 0 },
    totalLikes: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    totalShares: { type: Number, default: 0 },
  },
}, { timestamps: true });

PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Post', PostSchema);
