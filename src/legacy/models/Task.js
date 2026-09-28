const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  text:        { type: String, required: true },
  addedBy:     { type: String, required: true },
  addedByName: { type: String, default: '' },
}, { _id: true, timestamps: true });

const ReplySchema = new mongoose.Schema({
  text:          { type: String, required: true },
  repliedBy:     { type: String, required: true },
  repliedByName: { type: String, default: '' },
  // completion | update | blocked — signals intent
  type:          { type: String, enum: ['completion', 'update', 'blocked'], default: 'update' },
}, { _id: true, timestamps: true });

const DateChangeSchema = new mongoose.Schema({
  previousDate:  { type: Date },
  newDate:       { type: Date },
  reason:        { type: String, default: '' },
  changedBy:     { type: String },
  changedByName: { type: String, default: '' },
  changedAt:     { type: Date, default: Date.now },
}, { _id: false });

const TaskSchema = new mongoose.Schema({
  _id:            { type: String },
  title:          { type: String, required: true },
  description:    { type: String, default: '' },
  type:           { type: String, enum: ['general', 'family_specific'], default: 'general', index: true },
  familyId:       { type: String, index: true, default: null },
  familyName:     { type: String, default: '' },
  assignedTo:     { type: String, index: true, default: null },
  assignedToName: { type: String, default: '' },
  assignedBy:     { type: String, index: true },
  assignedByName: { type: String, default: '' },
  status:         { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending', index: true },
  completedAt:    { type: Date, default: null },
  scheduledDate:  { type: Date, default: null, index: true },
  dateHistory:    { type: [DateChangeSchema], default: [] },
  notes:          { type: [NoteSchema], default: [] },
  replies:        { type: [ReplySchema], default: [] },
  raw:            { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'tasks', strict: false, timestamps: true });

module.exports = mongoose.models.Task || mongoose.model('Task', TaskSchema);
