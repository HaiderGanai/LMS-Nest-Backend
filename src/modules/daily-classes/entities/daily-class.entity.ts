import { Schema } from 'mongoose';

export const DailyClassModelName = 'DailyClass';

export const DailyClassSchema = new Schema(
  {
    _id: { type: String },
    classType: { type: String, default: 'regular' },   // regular, temporary, reschedule
    status: { type: String, default: 'scheduled' },    // scheduled, active, running, taken, advance, absent, leave, rescheduled, cancelled
    bookingId: { type: Schema.Types.Mixed },
    teacherId: { type: String },
    teacherUid: { type: String },
    teacherName: { type: String },
    teacherTimezone: { type: String },
    studentId: { type: String },
    studentName: { type: String },
    studentTimezone: { type: String },
    familyId: { type: String },
    startUtc: { type: Date },
    endUtc: { type: Date },
    durationMinutes: { type: Number, default: 30 },
    adminDate: { type: String },            // YYYY-MM-DD in business timezone
    adminStartTime: { type: String },       // HH:mm
    adminEndTime: { type: String },
    teacherLocalDate: { type: String },
    teacherLocalStartTime: { type: String },
    teacherLocalEndTime: { type: String },
    studentLocalDate: { type: String },
    studentLocalStartTime: { type: String },
    activatedAt: { type: Date },
    startedAt: { type: Date },
    endedAt: { type: Date },
    onlineAt: { type: Date },
    rescheduledFromId: { type: String },
    rescheduledToId: { type: String },
    notes: { type: String },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
