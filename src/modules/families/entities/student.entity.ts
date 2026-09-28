import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const FamilyStudentModelName = 'Student';
export const FamilyStudentSchema: Schema = getLegacyModelSchema(FamilyStudentModelName);
