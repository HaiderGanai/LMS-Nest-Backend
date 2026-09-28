const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
  _id:        { type: String },
  teacherId:  { type: String, index: true },
  status:     { type: String, index: true, default: 'pending' }, // pending / reviewed / resolved
  severity:   { type: String, index: true }, // low / medium / high / critical
  category:   { type: String, index: true },
  resolved:   { type: Boolean, default: false, index: true },
  raw:        { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'teacher_complaints', strict: false, timestamps: true });

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);
