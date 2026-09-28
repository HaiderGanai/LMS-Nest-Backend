export interface JanusEvent {
  janus: string;
  session_id?: number;
  handle_id?: number;
  transaction?: string;
  plugindata?: Record<string, unknown>;
}
