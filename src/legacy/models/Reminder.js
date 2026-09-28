const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
  _id:             { type: String },
  title:           { type: String, required: true },
  description:     { type: String, default: '' },
  dueDate:         { type: Date, required: true },
  priority:        { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal', index: true },
  type:            { type: String, default: 'other' },
  status:          { type: String, enum: ['pending', 'completed', 'dismissed'], default: 'pending', index: true },
  notifyBefore:    { type: String, default: '1_hour' },
  createdBy:       { type: String, index: true },
  createdByName:   { type: String, default: '' },
  assignedTo:      { type: String, index: true },
  assignedToName:  { type: String, default: '' },
  completedAt:     { type: Date },
  raw:             { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'reminders', strict: false, timestamps: true });

ReminderSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
ReminderSchema.index({ createdBy: 1, status: 1 });

module.exports = mongoose.models.Reminder || mongoose.model('Reminder', ReminderSchema);
