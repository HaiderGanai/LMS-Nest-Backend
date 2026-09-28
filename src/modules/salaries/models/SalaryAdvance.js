const mongoose = require('mongoose');

const SalaryAdvanceSchema = new mongoose.Schema({
  _id:        { type: String },
  employeeId: { type: String, index: true },
  amount:     { type: Number, default: 0 },
  status:     { type: String, index: true, default: 'pending' }, // pending / approved / rejected
  monthKey:   { type: String, index: true }, // "2024-01" — month to deduct
  raw:        { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'salary_advances', strict: false, timestamps: true });

module.exports = mongoose.models.SalaryAdvance || mongoose.model('SalaryAdvance', SalaryAdvanceSchema);
