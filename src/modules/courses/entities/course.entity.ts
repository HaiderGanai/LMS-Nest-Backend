import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CourseModelName = 'Course';
export const CourseSchema: Schema = getLegacyModelSchema(CourseModelName);
