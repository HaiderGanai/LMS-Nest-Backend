import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ScheduleAssignmentRequestModelName = 'ScheduleAssignmentRequest';
export const ScheduleAssignmentRequestSchema: Schema = getLegacyModelSchema(ScheduleAssignmentRequestModelName);
