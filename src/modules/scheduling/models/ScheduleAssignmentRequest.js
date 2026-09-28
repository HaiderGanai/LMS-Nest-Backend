const mongoose = require('mongoose');

const ScheduleAssignmentRequestSchema = new mongoose.Schema({
  _id: { type: String },
  batchId: { type: String, index: true },
  familyId: { type: String, index: true },
  familyMemberId: { type: String, index: true },
  studentId: { type: String, index: true },
  studentName: String,
  teacherId: { type: String, index: true },
  teacherUid: { type: String, index: true },
  teacherEmployeeId: { type: String, index: true },
  teacherName: String,
  teacherTimezone: String,
  teacherGender: String,
  teacherNationality: String,
  teacherCategory: String,
  studentDate: { type: String, index: true },
  studentTime: String,
  studentEndTime: String,
  studentTimezone: String,
  durationMinutes: { type: Number, default: 30 },
  requiredDays: { type: [String], default: [] },
  requiredDaysKey: { type: String, index: true, default: '' },
  studentNeeds: { type: String, default: '' },
  matchedDays: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, index: true, default: 'pending' }, // pending / accepted / rejected / finalized / superseded / cancelled
  requestedBy: String,
  requestedByName: String,
  requestedAt: { type: Date, default: Date.now, index: true },
  requestNote: { type: String, default: '' },
  teacherResponseNote: { type: String, default: '' },
  respondedAt: Date,
  finalizedAt: Date,
  finalizedBy: String,
  finalBookingIds: { type: [String], default: [] },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'schedule_assignment_requests',
  strict: false,
  timestamps: true,
});

ScheduleAssignmentRequestSchema.index({ teacherId: 1, status: 1, requestedAt: -1 });
ScheduleAssignmentRequestSchema.index({ familyMemberId: 1, status: 1, requestedAt: -1 });
ScheduleAssignmentRequestSchema.index({ batchId: 1, status: 1, requestedAt: -1 });

module.exports = mongoose.models.ScheduleAssignmentRequest
  || mongoose.model('ScheduleAssignmentRequest', ScheduleAssignmentRequestSchema);
