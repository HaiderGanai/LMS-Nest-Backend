const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  _id:             { type: String },
  title:           { type: String, required: true },
  body:            { type: String, default: '' },
  targetType:      { type: String, enum: ['student', 'teacher'], required: true, index: true },
  teacherCategory: {
    type: String,
    enum: ['all', 'female_local', 'male_local', 'female_foreign', 'male_foreign'],
    default: 'all',
  },
  startDate:     { type: Date, required: true, index: true },
  endDate:       { type: Date, required: true, index: true },
  createdBy:     { type: String, default: '' },
  createdByName: { type: String, default: '' },
  isActive:      { type: Boolean, default: true },
}, { collection: 'announcements', strict: false, timestamps: true });

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);
