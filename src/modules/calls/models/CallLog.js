const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  roomId: { type: String, index: true },
  janusRoomId: { type: Number, index: true },
  status: { type: String, index: true },
  startedAt: { type: Date, index: true },
  endedAt: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'call_logs',
  strict: false,
  timestamps: true,
});

CallLogSchema.index({ callId: 1, createdAt: -1 });

module.exports = mongoose.models.CallLog || mongoose.model('CallLog', CallLogSchema);
