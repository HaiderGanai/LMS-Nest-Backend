const mongoose = require('mongoose');

const AuthUserSchema = new mongoose.Schema({
  _id: { type: String }, // firebase uid
  email: { type: String, index: true },
  displayName: String,
  phoneNumber: String,
  disabled: Boolean,
  customClaims: { type: mongoose.Schema.Types.Mixed, default: {} },
  providerData: { type: [mongoose.Schema.Types.Mixed], default: [] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'authUsers',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.AuthUser || mongoose.model('AuthUser', AuthUserSchema);

