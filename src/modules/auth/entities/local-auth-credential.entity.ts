import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const LocalAuthCredentialModelName = 'LocalAuthCredential';
export const LocalAuthCredentialSchema: Schema = getLegacyModelSchema(LocalAuthCredentialModelName);
