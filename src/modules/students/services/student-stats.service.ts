import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface CallLogsRepoModule {
  getStudentStatistics: (payload: { dataBackend: string; studentId: string }) => Promise<unknown>;
}

@Injectable()
export class StudentStatsService {
  private readonly callLogsRepoModule: CallLogsRepoModule = requireLegacyModule<CallLogsRepoModule>('src/legacy/repos/callLogsRepo.js');

  async getStudentStatistics(studentId: string): Promise<unknown> {
    return this.callLogsRepoModule.getStudentStatistics({
      dataBackend: 'mongo',
      studentId,
    });
  }
}
