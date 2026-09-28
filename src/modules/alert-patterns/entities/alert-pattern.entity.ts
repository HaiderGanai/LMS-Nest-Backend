import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const AlertPatternModelName = 'AlertPattern';
export const AlertPatternSchema: Schema = getLegacyModelSchema(AlertPatternModelName);
