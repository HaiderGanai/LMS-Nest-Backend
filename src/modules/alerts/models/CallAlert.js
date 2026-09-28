const mongoose = require('mongoose');

const CallAlertSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  type: { type: String, index: true },
  read: { type: Boolean, index: true },
  timestamp: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'call_alerts',
  strict: false,
  timestamps: true,
});

CallAlertSchema.index({ studentId: 1, read: 1, timestamp: -1 });
CallAlertSchema.index({ teacherId: 1, timestamp: -1 });

module.exports = mongoose.models.CallAlert || mongoose.model('CallAlert', CallAlertSchema);
