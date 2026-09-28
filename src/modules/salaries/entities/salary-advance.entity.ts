import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const SalaryAdvanceModelName = 'SalaryAdvance';
export const SalaryAdvanceSchema: Schema = getLegacyModelSchema(SalaryAdvanceModelName);
