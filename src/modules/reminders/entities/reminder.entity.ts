import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ReminderModelName = 'Reminder';
export const ReminderSchema: Schema = getLegacyModelSchema(ReminderModelName);
