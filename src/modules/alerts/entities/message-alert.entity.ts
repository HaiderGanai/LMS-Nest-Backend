import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const MessageAlertModelName = 'MessageAlert';
export const MessageAlertSchema: Schema = getLegacyModelSchema(MessageAlertModelName);
