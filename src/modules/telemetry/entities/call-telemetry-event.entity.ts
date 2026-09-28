import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallTelemetryEventModelName = 'CallTelemetryEvent';
export const CallTelemetryEventSchema: Schema = getLegacyModelSchema(CallTelemetryEventModelName);
