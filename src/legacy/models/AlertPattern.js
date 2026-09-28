const mongoose = require('mongoose');

const AlertPatternSchema = new mongoose.Schema({
  _id: { type: String },
  pattern: { type: String, required: true },       // regex string
  severity: { type: String, enum: ['high', 'medium', 'low'], required: true },
  type: { type: String, required: true },           // contact_info_sharing | boundary_crossing | grooming | threats | profanity | off_topic
  reason: { type: String, required: true },         // human readable label shown in LMS
  language: { type: String, default: 'all' },       // en | ur | ur-roman | ar | ar-roman | all
  enabled: { type: Boolean, default: true, index: true },
  isBuiltin: { type: Boolean, default: false },     // seeded patterns — UI warns before delete
  weight: { type: Number, default: null },          // for boundary_crossing behavior scoring
}, {
  collection: 'alert_patterns',
  strict: false,
  timestamps: true,
});

AlertPatternSchema.index({ severity: 1, enabled: 1 });

module.exports = mongoose.models.AlertPattern || mongoose.model('AlertPattern', AlertPatternSchema);
