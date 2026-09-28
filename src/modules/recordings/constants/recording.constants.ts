export const RECORDING_CONSTANTS = {
  retentionDays: Number(process.env.RECORDING_RETENTION_DAYS || 90),
  processingTimeoutMs: Number(process.env.RECORDING_PROCESSING_TIMEOUT_MS || 600000),
  recordingsPath: process.env.RECORDINGS_DIRECTORY || 'recordings',
} as const;
