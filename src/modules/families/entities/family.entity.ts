import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const FamilyModelName = 'Family';
export const FamilySchema: Schema = getLegacyModelSchema(FamilyModelName);
