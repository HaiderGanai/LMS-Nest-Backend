import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const StudentUserModelName = 'User';
export const StudentUserSchema: Schema = getLegacyModelSchema(StudentUserModelName);
