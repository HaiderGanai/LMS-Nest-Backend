const mongoose = require('mongoose');

const ScheduleBookingSchema = new mongoose.Schema({
  _id: { type: String },
  teacherId: { type: String, index: true },
  teacherUid: { type: String, index: true },
  teacherEmployeeId: { type: String, index: true },
  teacherName: String,
  teacherTimezone: String,
  familyId: { type: String, index: true },
  familyMemberId: { type: String, index: true },
  studentId: { type: String, index: true },
  studentName: String,
  studentTimezone: String,
  startUtc: { type: Date, index: true },
  endUtc: Date,
  durationMinutes: { type: Number, default: 30 },
  status: { type: String, index: true, default: 'booked' }, // booked / cancelled / completed / needs_review
  bookingSource: { type: String, default: 'admin_search' },
  anchorType: { type: String, default: 'student_local' },
  studentLocalDate: String,
  studentLocalStartTime: String,
  studentLocalEndTime: String,
  teacherLocalDate: String,
  teacherLocalStartTime: String,
  teacherLocalEndTime: String,
  businessTimezone: String,
  businessDate: { type: String, index: true },
  businessMonthKey: { type: String, index: true },
  assignedBy: String,
  adminNote: { type: String, default: '' },
  conflictState: { type: String, default: '' },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'schedule_bookings',
  strict: false,
  timestamps: true,
});

ScheduleBookingSchema.index({ teacherId: 1, startUtc: 1 });
ScheduleBookingSchema.index({ teacherUid: 1, startUtc: 1 });
ScheduleBookingSchema.index({ familyMemberId: 1, startUtc: 1 });
ScheduleBookingSchema.index({ studentId: 1, startUtc: 1 });

module.exports = mongoose.models.ScheduleBooking
  || mongoose.model('ScheduleBooking', ScheduleBookingSchema);
