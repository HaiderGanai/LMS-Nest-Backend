const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  _id:        { type: String },
  familyId:   { type: String, index: true },
  month:      { type: String, index: true }, // "2024-01"
  year:       { type: Number, index: true },
  status:     { type: String, index: true, default: 'pending' }, // pending / paid / partially_paid / overdue / cancelled
  totalAmount:{ type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  dueDate:    Date,
  raw:        { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'invoices', strict: false, timestamps: true });

InvoiceSchema.index({ familyId: 1, month: 1 }, { unique: false });
InvoiceSchema.index({ status: 1, month: 1 });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
