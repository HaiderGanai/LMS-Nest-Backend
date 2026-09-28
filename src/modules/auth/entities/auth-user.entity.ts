import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const AuthUserModelName = 'AuthUser';
export const AuthUserSchema: Schema = getLegacyModelSchema(AuthUserModelName);
