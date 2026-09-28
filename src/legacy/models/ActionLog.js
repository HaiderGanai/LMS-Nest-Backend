const mongoose = require('mongoose');

const ActionLogSchema = new mongoose.Schema({
  action:          { type: String, required: true, index: true },
  entity:          { type: String, required: true, index: true },
  entityId:        { type: String, default: '' },
  entityTitle:     { type: String, default: '' },

  performedBy:     { type: String, required: true, index: true },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },

  // Who this action was done TO / FOR (for profile-level filtering)
  relatedFamilyId:      { type: String, default: '', index: true },
  relatedFamilyName:    { type: String, default: '' },
  relatedEmployeeId:    { type: String, default: '', index: true },
  relatedEmployeeName:  { type: String, default: '' },

  details:  { type: mongoose.Schema.Types.Mixed, default: {} },
  ip:       { type: String, default: '' },
}, {
  collection: 'action_logs',
  strict: false,
  timestamps: { createdAt: true, updatedAt: false },
});

// TTL: auto-delete logs older than 1 year
ActionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

module.exports = mongoose.models.ActionLog || mongoose.model('ActionLog', ActionLogSchema);
