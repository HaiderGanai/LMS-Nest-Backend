const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  _id: { type: String },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  roomId: { type: String, index: true },
  janusRoomId: Number,
  status: { type: String, index: true },
  startedAt: { type: Date, index: true },
  endedAt: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'calls',
  strict: false,
  timestamps: true,
});

CallSchema.index({ teacherId: 1, startedAt: -1 });
CallSchema.index({ studentId: 1, startedAt: -1 });

module.exports = mongoose.models.Call || mongoose.model('Call', CallSchema);
