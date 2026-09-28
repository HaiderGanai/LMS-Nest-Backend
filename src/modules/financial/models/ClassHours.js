const mongoose = require('mongoose');

const ClassHoursSchema = new mongoose.Schema({
  _id:       { type: String },
  familyId:  { type: String, index: true },
  studentId: { type: String, index: true },
  teacherId: { type: String, index: true },
  date:      { type: Date, index: true },
  hours:     { type: Number, default: 0 },
  month:     { type: String, index: true }, // "2024-01"
  raw:       { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'class_hours', strict: false, timestamps: true });

ClassHoursSchema.index({ familyId: 1, month: 1 });
ClassHoursSchema.index({ studentId: 1, date: 1 });

module.exports = mongoose.models.ClassHours || mongoose.model('ClassHours', ClassHoursSchema);
