import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const EmployeeModelName = 'Employee';
export const EmployeeSchema: Schema = getLegacyModelSchema(EmployeeModelName);
