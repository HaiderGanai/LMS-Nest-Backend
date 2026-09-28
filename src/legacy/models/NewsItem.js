const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  _id:         { type: String, default: () => require('crypto').randomUUID() },
  text:        { type: String, required: true },
  addedBy:     { type: String, required: true },
  addedByName: { type: String, default: '' },
  addedAt:     { type: Date,   default: Date.now },
}, { _id: false });

const NewsItemSchema = new mongoose.Schema({
  _id:             { type: String, default: () => require('crypto').randomUUID() },
  title:           { type: String, required: true },
  expiresAt:       { type: Date,   default: null },
  createdBy:       { type: String, required: true, index: true },
  createdByName:   { type: String, default: '' },
  notes:           { type: [NoteSchema], default: [] },
}, {
  collection: 'news_items',
  timestamps: { createdAt: true, updatedAt: false },
});

// Auto-remove expired: TTL won't work dynamically, we filter in query.
// Sparse index on expiresAt for fast expiry queries.
NewsItemSchema.index({ expiresAt: 1 }, { sparse: true });

module.exports = mongoose.models.NewsItem || mongoose.model('NewsItem', NewsItemSchema);
