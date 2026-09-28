const mongoose = require('mongoose');

const ProcessingQueueSchema = new mongoose.Schema({
  _id: { type: String },
  callId: { type: String, index: true },
  roomId: String,
  janusRoomId: Number,
  status: { type: String, index: true },
  queuedAt: { type: Date, index: true },
  processedAt: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  collection: 'processingQueue',
  strict: false,
  timestamps: true,
});

ProcessingQueueSchema.index({ status: 1, queuedAt: 1 });

module.exports = mongoose.models.ProcessingQueue
  || mongoose.model('ProcessingQueue', ProcessingQueueSchema);
