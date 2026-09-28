export const CALL_CONSTANTS = {
  reconnectionGracePeriodMs: Number(process.env.CALL_RECONNECTION_GRACE_PERIOD_MS || 60000),
  janusHttpUrl: process.env.JANUS_HTTP_URL || 'http://127.0.0.1:8088/janus',
  callTimeoutMs: Number(process.env.CALL_TIMEOUT_MS || 300000),
} as const;
