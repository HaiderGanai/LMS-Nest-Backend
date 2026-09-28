import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class TranscriptService {
  constructor(
    @InjectModel('FlaggedTranscript')
    private readonly flaggedTranscriptModel: Model<Record<string, unknown>>,
    @InjectModel('CallRecording')
    private readonly callRecordingModel: Model<Record<string, unknown>>,
  ) {}

  /**
   * POST /api/stt/ingest — update CallRecording transcript + run moderation
   * Called by STT service (no auth).
   */
  async sttIngest(body: Record<string, unknown>): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    const { callId, transcript, languageCode } = body as Record<string, unknown>;

    if (!callId || !transcript) {
      throw new BadRequestException('callId and transcript are required');
    }

    // Allowed language codes (mirrors STT_ALLOWED_LANGUAGE_CODES in reference)
    const ALLOWED = ['en-US', 'en-GB', 'ur-PK', 'ar-SA'];

    if (languageCode && !ALLOWED.includes(String(languageCode))) {
      return { success: true, skipped: true, reason: 'language_not_allowed' };
    }

    // Append transcript to the CallRecording document if it exists
    await this.callRecordingModel.updateOne(
      { _id: callId },
      {
        $push: { transcriptChunks: { transcript, languageCode: languageCode || 'en-US', receivedAt: new Date() } },
        $set: { updatedAt: new Date() },
      },
    );

    return { success: true };
  }

  /**
   * POST /api/flagged-transcript — save flagged transcript entry
   * Called by clients (no auth).
   */
  async createFlaggedTranscript(
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; id: string; message: string }> {
    const { callId, transcript, severity } = body as Record<string, unknown>;

    if (!callId || !transcript || !severity) {
      throw new BadRequestException('Missing required fields: callId, transcript, severity');
    }

    const flaggedId = `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await this.flaggedTranscriptModel.create({
      _id: flaggedId,
      callId,
      chunkId: (body.chunkId as string) || null,
      teacherId: (body.teacherId as string) || null,
      studentId: (body.studentId as string) || null,
      severity,
      reason: (body.reason as string) || 'Pattern detected',
      pattern: (body.pattern as string) || null,
      transcript,
      confidence: (body.confidence as number) || 0,
      participantType: (body.participantType as string) || 'unknown',
      timestamp: new Date(),
      createdAt: new Date().toISOString(),
    });

    return { success: true, id: flaggedId, message: 'Flagged transcript saved successfully' };
  }
}
