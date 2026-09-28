const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  _id: { type: String },
  id: String,
  participants: { type: [String], default: [], index: true },
  participantRoles: { type: [String], default: [] },
  participantNames: { type: [String], default: [] },
  unreadCount: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastMessage: String,
  lastMessageTime: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'conversations',
  strict: false,
  timestamps: true,
});

ConversationSchema.index({ participants: 1, lastMessageTime: -1 });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
