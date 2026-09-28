import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordingsRepository } from '../repositories/recordings.repository';

@Injectable()
export class RecordingsService {
  constructor(private readonly recordingsRepository: RecordingsRepository) {}

  async getRecordings(limit = 50): Promise<{
    success: boolean;
    count: number;
    recordings: unknown[];
  }> {
    const rows = (await this.recordingsRepository.listRecordings(limit)) as unknown[];
    return { success: true, count: rows.length, recordings: rows };
  }

  async getRecordingById(callId: string): Promise<{
    success: boolean;
    recording: unknown;
    violations: unknown[];
  }> {
    const record = await this.recordingsRepository.getRecordingDetails(callId);
    if (!record) {
      throw new NotFoundException('Recording not found');
    }
    const rec = record as { data?: Record<string, unknown>; violations?: unknown[]; id?: string };
    return {
      success: true,
      recording: { id: rec.id || callId, ...(rec.data || {}) },
      violations: Array.isArray(rec.violations) ? rec.violations : [],
    };
  }
}
