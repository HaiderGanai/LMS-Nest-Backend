const mongoose = require('mongoose');

const FamilyMemberSchema = new mongoose.Schema({
  _id: { type: String },
  familyId: { type: String, index: true },
  uid: { type: String, index: true },
  studentId: { type: String, index: true },
  role: { type: String, index: true },
  status: { type: String, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'familyMembers',
  strict: false,
  timestamps: true,
});

FamilyMemberSchema.index({ familyId: 1, role: 1 });

module.exports = mongoose.models.FamilyMember || mongoose.model('FamilyMember', FamilyMemberSchema);
