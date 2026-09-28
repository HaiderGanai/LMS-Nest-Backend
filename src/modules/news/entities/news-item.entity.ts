import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const NewsItemModelName = 'NewsItem';
export const NewsItemSchema: Schema = getLegacyModelSchema(NewsItemModelName);
