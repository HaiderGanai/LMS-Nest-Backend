const mongoose = require('mongoose');

const VideoAlertSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  teacherId: { type: String, index: true },
  studentId: { type: String, index: true },
  alertType: { type: String, index: true },
  read: { type: Boolean, index: true },
  createdAt: { type: Date, index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'video_alerts',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.VideoAlert || mongoose.model('VideoAlert', VideoAlertSchema);
