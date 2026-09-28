import type { Schema } from 'mongoose';
import { getLegacyModelSchema } from '../../../shared/utils/legacy-model.util';

export const FlaggedTranscriptModelName = 'FlaggedTranscript';
export const FlaggedTranscriptSchema: Schema = getLegacyModelSchema(FlaggedTranscriptModelName);
