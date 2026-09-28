import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const UserModelName = 'User';
export const UserSchema: Schema = getLegacyModelSchema(UserModelName);
