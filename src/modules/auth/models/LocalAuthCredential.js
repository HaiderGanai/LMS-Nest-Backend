const mongoose = require('mongoose');

const LocalAuthCredentialSchema = new mongoose.Schema({
  _id: { type: String }, // lowercased email
  email: { type: String, index: true },
  userId: { type: String, index: true },
  role: { type: String, index: true },
  name: String,
  password: String, // optional plain password for migration period
  passwordHash: String, // optional "sha256:<hex>"
  isActive: { type: Boolean, default: true, index: true },
  disabled: { type: Boolean, default: false, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'localAuthCredentials',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.LocalAuthCredential
  || mongoose.model('LocalAuthCredential', LocalAuthCredentialSchema);
