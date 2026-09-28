import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const VideoAlertModelName = 'VideoAlert';
export const VideoAlertSchema: Schema = getLegacyModelSchema(VideoAlertModelName);
