import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const EmployeeUserModelName = 'User';
export const EmployeeUserSchema: Schema = getLegacyModelSchema(EmployeeUserModelName);
