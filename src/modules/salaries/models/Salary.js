const mongoose = require('mongoose');

const SalarySchema = new mongoose.Schema({
  _id:         { type: String },
  employeeId:  { type: String, index: true },
  month:       { type: String, index: true }, // "2024-01"
  year:        { type: Number, index: true },
  status:      { type: String, index: true, default: 'pending' }, // pending / approved / paid
  grossAmount: { type: Number, default: 0 },
  netAmount:   { type: Number, default: 0 },
  raw:         { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'salaries', strict: false, timestamps: true });

SalarySchema.index({ employeeId: 1, month: 1 });

module.exports = mongoose.models.Salary || mongoose.model('Salary', SalarySchema);
