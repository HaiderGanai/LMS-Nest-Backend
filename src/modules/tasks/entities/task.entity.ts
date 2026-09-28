import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const TaskModelName = 'Task';
export const TaskSchema: Schema = getLegacyModelSchema(TaskModelName);
