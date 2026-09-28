import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ClassHoursModelName = 'ClassHours';
export const ClassHoursSchema: Schema = getLegacyModelSchema(ClassHoursModelName);
