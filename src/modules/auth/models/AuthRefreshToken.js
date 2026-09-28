const mongoose = require('mongoose');

const AuthRefreshTokenSchema = new mongoose.Schema({
  _id: { type: String }, // jti
  userId: { type: String, index: true, required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date, default: null, index: true },
  replacedByTokenHash: { type: String, default: null },
  issuedAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null },
  userAgent: { type: String, default: null },
  ip: { type: String, default: null },
  clientApp: { type: String, default: null, index: true },
}, {
  collection: 'authRefreshTokens',
  strict: true,
  timestamps: true,
});

AuthRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthRefreshTokenSchema.index({ userId: 1, revokedAt: 1 });

module.exports = mongoose.models.AuthRefreshToken
  || mongoose.model('AuthRefreshToken', AuthRefreshTokenSchema);

