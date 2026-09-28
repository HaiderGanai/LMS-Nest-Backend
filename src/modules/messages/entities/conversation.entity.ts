import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ConversationModelName = 'Conversation';
export const ConversationSchema: Schema = getLegacyModelSchema(ConversationModelName);
