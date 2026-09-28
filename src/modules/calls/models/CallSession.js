const mongoose = require('mongoose');

const CallSessionSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  roomId: String,
  janusRoomId: Number,
  status: { type: String, index: true },
  startedAt: { type: Date, index: true },
  updatedAt: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'call_sessions',
  strict: false,
  timestamps: true,
});

CallSessionSchema.index({ studentId: 1, status: 1, startedAt: -1 });

module.exports = mongoose.models.CallSession || mongoose.model('CallSession', CallSessionSchema);
