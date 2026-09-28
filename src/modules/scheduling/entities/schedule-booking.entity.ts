import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ScheduleBookingModelName = 'ScheduleBooking';
export const ScheduleBookingSchema: Schema = getLegacyModelSchema(ScheduleBookingModelName);
