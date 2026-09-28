import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ViolationModelName = 'Violation';
export const ViolationSchema: Schema = getLegacyModelSchema(ViolationModelName);
