const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String, required: [true, 'Le nom est requis'], trim: true, maxlength: 100
  },
  email: {
    type: String, required: [true, 'L\'email est requis'],
    unique: true, lowercase: true, trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email invalide']
  },
  password: {
    type: String, required: [true, 'Le mot de passe est requis'], minlength: 6, select: false
  },
  role: {
    type: String, enum: ['admin', 'user'], default: 'user'
  },
  company: { type: String, default: 'OPTINET SARLU' },
  phone: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
}, { timestamps: true });

// Hash du mot de passe avant sauvegarde
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Vérification mot de passe
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
