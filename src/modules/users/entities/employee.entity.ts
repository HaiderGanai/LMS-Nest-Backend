import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const UsersEmployeeModelName = 'Employee';
export const UsersEmployeeSchema: Schema = getLegacyModelSchema(UsersEmployeeModelName);
