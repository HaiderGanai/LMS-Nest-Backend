import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const SalaryModelName = 'Salary';
export const SalarySchema: Schema = getLegacyModelSchema(SalaryModelName);
