import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const AnnouncementModelName = 'Announcement';
export const AnnouncementSchema: Schema = getLegacyModelSchema(AnnouncementModelName);
