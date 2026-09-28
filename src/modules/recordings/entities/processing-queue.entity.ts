import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ProcessingQueueModelName = 'ProcessingQueue';
export const ProcessingQueueSchema: Schema = getLegacyModelSchema(ProcessingQueueModelName);
