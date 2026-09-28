const mongoose = require('mongoose');

const ScheduleAvailabilitySchema = new mongoose.Schema({
  _id: { type: String },
  teacherId: { type: String, index: true },
  teacherUid: { type: String, index: true },
  teacherName: String,
  timezone: { type: String, index: true },
  date: { type: String, index: true }, // Teacher local date (YYYY-MM-DD)
  ranges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  breaks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  notes: { type: String, default: '' },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'schedule_availability',
  strict: false,
  timestamps: true,
});

ScheduleAvailabilitySchema.index({ teacherId: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.ScheduleAvailability
  || mongoose.model('ScheduleAvailability', ScheduleAvailabilitySchema);
