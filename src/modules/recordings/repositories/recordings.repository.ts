import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface RecordingsRepoModule {
  listRecordings: (payload: { dataBackend: string; limit?: number }) => Promise<unknown>;
  getRecordingDetails: (payload: { dataBackend: string; callId: string }) => Promise<unknown>;
}

@Injectable()
export class RecordingsRepository {
  private readonly recordingsRepoModule: RecordingsRepoModule = requireLegacyModule<RecordingsRepoModule>('src/legacy/repos/recordingsRepo.js');

  async listRecordings(limit = 50): Promise<unknown> {
    return this.recordingsRepoModule.listRecordings({
      dataBackend: 'mongo',
      limit,
    });
  }

  async getRecordingDetails(callId: string): Promise<unknown> {
    return this.recordingsRepoModule.getRecordingDetails({
      dataBackend: 'mongo',
      callId,
    });
  }
}
