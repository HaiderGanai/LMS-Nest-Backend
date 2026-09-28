import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface CallLogsRepoModule {
  getStudentCallLogs: (payload: { dataBackend: string; studentId: string }) => Promise<unknown>;
  getStudentStatistics: (payload: { dataBackend: string; studentId: string }) => Promise<unknown>;
}

@Injectable()
export class CallsRepository {
  private readonly callLogsRepoModule: CallLogsRepoModule = requireLegacyModule<CallLogsRepoModule>('src/legacy/repos/callLogsRepo.js');

  async getStudentCallLogs(studentId: string): Promise<unknown> {
    return this.callLogsRepoModule.getStudentCallLogs({
      dataBackend: 'mongo',
      studentId,
    });
  }

  async getStudentStatistics(studentId: string): Promise<unknown> {
    return this.callLogsRepoModule.getStudentStatistics({
      dataBackend: 'mongo',
      studentId,
    });
  }
}
