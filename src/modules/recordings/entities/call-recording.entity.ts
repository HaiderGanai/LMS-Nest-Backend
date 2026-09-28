import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallRecordingModelName = 'CallRecording';
export const CallRecordingSchema: Schema = getLegacyModelSchema(CallRecordingModelName);
