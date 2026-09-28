import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const InvoiceModelName = 'Invoice';
export const InvoiceSchema: Schema = getLegacyModelSchema(InvoiceModelName);
