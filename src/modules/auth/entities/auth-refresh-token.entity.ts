import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const AuthRefreshTokenModelName = 'AuthRefreshToken';
export const AuthRefreshTokenSchema: Schema = getLegacyModelSchema(AuthRefreshTokenModelName);
