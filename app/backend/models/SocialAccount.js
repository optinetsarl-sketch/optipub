const mongoose = require('mongoose');

const SocialAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true
  },
  platform: {
    type: String,
    enum: ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'whatsapp_status', 'whatsapp_channel'],
    required: true
  },
  accountName: { type: String, required: true },
  accountId: { type: String },         // ID de la page/compte sur la plateforme
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiresAt: { type: Date },
  profilePicture: { type: String },
  followersCount: { type: Number, default: 0 },
  status: { type: String, enum: ['connected', 'disconnected', 'expired'], default: 'connected' },
  metadata: { type: mongoose.Schema.Types.Mixed }, // données spécifiques à chaque plateforme
}, { timestamps: true });

// Index unique par utilisateur + plateforme
SocialAccountSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('SocialAccount', SocialAccountSchema);
