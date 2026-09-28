const mongoose = require('mongoose');

const FlaggedTranscriptSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  severity: { type: String, index: true },
  createdAt: { type: Date, index: true },
  timestamp: Date,
  text: String,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'flagged_transcripts',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.FlaggedTranscript
  || mongoose.model('FlaggedTranscript', FlaggedTranscriptSchema);
