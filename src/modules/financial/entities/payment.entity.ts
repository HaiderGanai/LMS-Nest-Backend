import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const PaymentModelName = 'Payment';
export const PaymentSchema: Schema = getLegacyModelSchema(PaymentModelName);
