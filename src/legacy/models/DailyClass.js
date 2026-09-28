const mongoose = require('mongoose');

const DailyClassSchema = new mongoose.Schema({
  _id: { type: String },

  // Class type: regular, trial, temporary, reschedule, makeup, ...
  classType: { type: String, default: 'regular', index: true },

  // Status lifecycle
  // scheduled → active → running → taken
  //                    → absent
  //                    → leave
  // original slot when rescheduled → rescheduled
  status: {
    type: String,
    default: 'scheduled',
    index: true,
    enum: ['scheduled', 'active', 'running', 'taken', 'absent', 'declined', 'leave', 'overdue', 'rescheduled', 'cancelled'],
  },

  // Source booking (if generated from weekly schedule)
  bookingId: { type: String, index: true },

  // Reschedule links
  rescheduledFromId: { type: String, index: true }, // this class was rescheduled FROM that class
  rescheduledToId:   { type: String, index: true }, // that class replaced this one

  // Teacher info
  teacherId:       { type: String, index: true },
  teacherUid:      { type: String, index: true },
  teacherName:     String,
  teacherTimezone: String,

  // Student info
  studentId:       { type: String, index: true },
  studentName:     String,
  studentTimezone: String,
  familyId:        { type: String, index: true },

  // UTC times
  startUtc: { type: Date, index: true },
  endUtc:   Date,
  durationMinutes: { type: Number, default: 30 },

  // Admin (business) local times — A-Time column
  adminDate:      { type: String, index: true }, // YYYY-MM-DD
  adminStartTime: String,                         // HH:MM
  adminEndTime:   String,

  // Teacher local times — T-Time column
  teacherLocalDate:      String,
  teacherLocalStartTime: String,
  teacherLocalEndTime:   String,

  // Student local times — S-Time column
  studentLocalDate:      String,
  studentLocalStartTime: String,

  // Online time — when class actually connected (Online Time column)
  onlineAt: Date,

  // Teacher activated at (marks teacher attendance)
  activatedAt: Date,

  // Class started (Running)
  startedAt: Date,

  // Class ended
  endedAt: Date,

  notes:  { type: String, default: '' },
  raw:    { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'daily_classes',
  strict: false,
  timestamps: true,
});

DailyClassSchema.index({ adminDate: 1, teacherId: 1 });
DailyClassSchema.index({ adminDate: 1, status: 1 });
DailyClassSchema.index({ startUtc: 1, teacherId: 1 });

module.exports = mongoose.models.DailyClass
  || mongoose.model('DailyClass', DailyClassSchema);
