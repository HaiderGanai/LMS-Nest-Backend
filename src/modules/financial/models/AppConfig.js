const mongoose = require('mongoose');

const AppConfigSchema = new mongoose.Schema({
  _id: { type: String },
  key: { type: String, index: true },
  value: { type: mongoose.Schema.Types.Mixed },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'appConfig',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.AppConfig || mongoose.model('AppConfig', AppConfigSchema);
