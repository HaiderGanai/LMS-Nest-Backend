const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  _id: { type: String },
  parentId: { type: String, index: true },
  teacherId: { type: String, index: true },
  assignedTeacher: { type: String, index: true },
  name: String,
  email: String,
  studentStatus: String,
  isOnline: { type: Boolean, index: true },
  lastSeen: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'students',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.Student || mongoose.model('Student', StudentSchema);

