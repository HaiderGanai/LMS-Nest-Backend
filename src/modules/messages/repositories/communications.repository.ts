import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface CommunicationsRepoModule {
  getStudentMessages: (payload: { dataBackend: string; studentId: string; limit?: number }) => Promise<unknown>;
  getStudentConversations: (payload: { dataBackend: string; studentId: string }) => Promise<unknown>;
  getConversationMessages: (payload: { dataBackend: string; conversationId: string }) => Promise<unknown>;
}

@Injectable()
export class CommunicationsRepository {
  private readonly communicationsRepoModule: CommunicationsRepoModule = requireLegacyModule<CommunicationsRepoModule>('src/legacy/repos/communicationsRepo.js');

  async getStudentMessages(studentId: string, limit = 50): Promise<unknown> {
    return this.communicationsRepoModule.getStudentMessages({
      dataBackend: 'mongo',
      studentId,
      limit,
    });
  }

  async getStudentConversations(studentId: string): Promise<unknown> {
    return this.communicationsRepoModule.getStudentConversations({
      dataBackend: 'mongo',
      studentId,
    });
  }

  async getConversationMessages(conversationId: string): Promise<unknown> {
    return this.communicationsRepoModule.getConversationMessages({
      dataBackend: 'mongo',
      conversationId,
    });
  }
}
