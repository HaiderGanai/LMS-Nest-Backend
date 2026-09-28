const mongoose = require('mongoose');

const ChildSchema = new mongoose.Schema({
  studentId: { type: String, index: true },
  name: String,
  email: String,
  assignedTeacher: { type: String, index: true },
  studentStatus: String,
  isOnline: Boolean,
  avatarColor: String,
  avatarUrl: String,
  lastSeen: Date,
}, { _id: false, strict: false });

const UserSchema = new mongoose.Schema({
  _id: { type: String },
  role: { type: String, index: true },
  email: { type: String, index: true },
  name: String,
  username: String,
  isOnline: { type: Boolean, index: true },
  isActive: { type: Boolean, index: true },
  activeStudentId: String,
  children: { type: [ChildSchema], default: [] },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'users',
  strict: false,
  timestamps: true,
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
