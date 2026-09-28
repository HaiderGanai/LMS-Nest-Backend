import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const UsersAuthUserModelName = 'AuthUser';
export const UsersAuthUserSchema: Schema = getLegacyModelSchema(UsersAuthUserModelName);
