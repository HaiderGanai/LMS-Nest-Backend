import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const MessageModelName = 'Message';
export const MessageSchema: Schema = getLegacyModelSchema(MessageModelName);
