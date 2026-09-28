const mongoose = require('mongoose');

const CallRecordingSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  roomId: String,
  janusRoomId: Number,
  status: { type: String, index: true },
  startedAt: Date,
  endedAt: Date,
  createdAt: Date,
  processedAt: Date,
  rawFileCount: Number,
  rawAudioCount: Number,
  rawVideoCount: Number,
  rawSizeBytes: Number,
  playbackUrl: String,
  playbackFileName: String,
  playbackSizeBytes: Number,
  playbackVariants: { type: mongoose.Schema.Types.Mixed, default: {} },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'callRecordings',
  strict: false,
  timestamps: true,
});

CallRecordingSchema.index({ createdAt: -1 });
CallRecordingSchema.index({ teacherId: 1, createdAt: -1 });
CallRecordingSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.models.CallRecording
  || mongoose.model('CallRecording', CallRecordingSchema);

