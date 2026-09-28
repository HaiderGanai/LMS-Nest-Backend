import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ActionLogModelName = 'ActionLog';
export const ActionLogSchema: Schema = getLegacyModelSchema(ActionLogModelName);
