const mongoose = require('mongoose');

const MessageAlertSchema = new mongoose.Schema({
  _id: { type: String },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  conversationId: { type: String, index: true },
  messageId: { type: String, index: true },
  pattern: { type: String },
  patternMatched: { type: String },
  content: { type: String },
  messageContent: { type: String },
  severity: { type: String, index: true },
  resolved: { type: Boolean, index: true, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: String },
  resolvedByUID: { type: String },
  resolutionNotes: { type: String },
  resolutionCategory: { type: String },
  timestamp: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'message_alerts',
  strict: false,
  timestamps: true,
});

MessageAlertSchema.index({ teacherId: 1, timestamp: -1 });
MessageAlertSchema.index({ resolved: 1, timestamp: -1 });

module.exports = mongoose.models.MessageAlert || mongoose.model('MessageAlert', MessageAlertSchema);
