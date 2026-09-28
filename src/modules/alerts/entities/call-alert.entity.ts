import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallAlertModelName = 'CallAlert';
export const CallAlertSchema: Schema = getLegacyModelSchema(CallAlertModelName);
