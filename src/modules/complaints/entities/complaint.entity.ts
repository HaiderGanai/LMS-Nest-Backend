import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const ComplaintModelName = 'Complaint';
export const ComplaintSchema: Schema = getLegacyModelSchema(ComplaintModelName);
