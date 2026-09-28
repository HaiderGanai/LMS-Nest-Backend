const mongoose = require('mongoose');

const ViolationSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  type: { type: String, index: true },
  severity: { type: String, index: true },
  createdAt: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'violations',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.Violation || mongoose.model('Violation', ViolationSchema);
