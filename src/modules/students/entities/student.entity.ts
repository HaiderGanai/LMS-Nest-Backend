import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const StudentModelName = 'Student';
export const StudentSchema: Schema = getLegacyModelSchema(StudentModelName);
