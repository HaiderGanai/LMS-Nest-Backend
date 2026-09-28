import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallsCallRecordingModelName = 'CallRecording';
export const CallsCallRecordingSchema: Schema = getLegacyModelSchema(CallsCallRecordingModelName);
