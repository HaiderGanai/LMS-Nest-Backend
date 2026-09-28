const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  _id: { type: String },
  conversationId: { type: String, index: true },
  senderId: { type: String, index: true },
  receiverId: { type: String, index: true },
  participants: { type: [String], default: [], index: true },
  content: String,
  text: String,
  type: String,
  senderName: String,
  receiverName: String,
  senderRole: String,
  receiverRole: String,
  isRead: { type: Boolean, index: true },
  read: { type: Boolean, index: true },
  seenByAdmin: { type: Boolean, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'messages',
  strict: false,
  timestamps: true,
});

MessageSchema.index({ conversationId: 1, timestamp: -1 });
MessageSchema.index({ receiverId: 1, read: 1, timestamp: -1 });
MessageSchema.index({ receiverId: 1, isRead: 1, timestamp: -1 });

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
