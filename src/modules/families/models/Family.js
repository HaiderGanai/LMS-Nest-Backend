const mongoose = require('mongoose');

const FamilySchema = new mongoose.Schema({
  _id: { type: String },
  parentUid: { type: String, index: true },
  parentEmail: { type: String, index: true },
  status: { type: String, index: true },
  name: String,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'families',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.Family || mongoose.model('Family', FamilySchema);
