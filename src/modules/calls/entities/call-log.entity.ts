import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallLogModelName = 'CallLog';
export const CallLogSchema: Schema = getLegacyModelSchema(CallLogModelName);
