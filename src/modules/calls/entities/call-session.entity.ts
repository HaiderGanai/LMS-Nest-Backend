import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallSessionModelName = 'CallSession';
export const CallSessionSchema: Schema = getLegacyModelSchema(CallSessionModelName);
