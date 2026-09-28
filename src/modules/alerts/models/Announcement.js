const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  _id: { type: String },
  title: String,
  body: String,
  targetAudience: { type: String, index: true },
  active: { type: Boolean, index: true },
  createdBy: { type: String, index: true },
  createdAt: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'announcements',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);
