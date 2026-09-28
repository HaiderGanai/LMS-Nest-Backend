const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  _id:       { type: String },
  invoiceId: { type: String, index: true },
  familyId:  { type: String, index: true },
  amount:    { type: Number, default: 0 },
  method:    String,
  raw:       { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'payments', strict: false, timestamps: true });

module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
