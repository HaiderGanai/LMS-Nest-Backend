import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ScheduleAvailabilityModelName = 'ScheduleAvailability';
export const ScheduleAvailabilitySchema: Schema = getLegacyModelSchema(ScheduleAvailabilityModelName);
