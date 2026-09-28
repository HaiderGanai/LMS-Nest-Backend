const mongoose = require('mongoose');

const CallTelemetryEventSchema = new mongoose.Schema({
  callId: { type: String, index: true },
  roomId: { type: String, index: true },
  janusRoomId: { type: Number, index: true },
  actorRole: { type: String, index: true }, // teacher | student | parent | admin | system
  actorId: { type: String, index: true },
  app: { type: String, index: true }, // teacher | student | parent | backend | lms
  platform: { type: String, index: true }, // android | ios | macos | windows | web | server
  eventType: { type: String, index: true }, // network_lost | join_timeout | ...
  severity: { type: String, index: true, default: 'info' }, // info | warning | error | critical
  category: { type: String, index: true, default: 'general' }, // network | media | signaling | lifecycle
  message: { type: String, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  eventAt: { type: Date, index: true, default: Date.now },
}, {
  collection: 'call_telemetry_events',
  strict: false,
  timestamps: true,
});

CallTelemetryEventSchema.index({ callId: 1, eventAt: -1 });
CallTelemetryEventSchema.index({ roomId: 1, eventAt: -1 });

module.exports =
  mongoose.models.CallTelemetryEvent ||
  mongoose.model('CallTelemetryEvent', CallTelemetryEventSchema);
