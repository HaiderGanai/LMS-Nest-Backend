import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const CallModelName = 'Call';
export const CallSchema: Schema = getLegacyModelSchema(CallModelName);
