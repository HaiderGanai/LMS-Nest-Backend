const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  _id:         { type: String },           // same as uid
  uid:         { type: String, index: true },
  email:       { type: String, index: true },
  name:        String,
  designation: { type: String, index: true }, // teacher / admin / manager
  role:        { type: String, index: true }, // teacher / admin
  status:      { type: String, index: true }, // active / inactive / on_training
  isActive:    { type: Boolean, index: true, default: true },
  raw:         { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'employees', strict: false, timestamps: true });

module.exports = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
