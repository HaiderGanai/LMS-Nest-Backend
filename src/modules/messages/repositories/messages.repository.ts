import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';
import type { SendMessageDto } from '../dto/send-message.dto';

interface MessagesWriteRepoModule {
  sendMessage: (payload: { dataBackend: string; payload: SendMessageDto }) => Promise<unknown>;
  markRead: (payload: { dataBackend: string; conversationId: string; userId: string }) => Promise<number>;
  getUidByUserId: (payload: { dataBackend: string; userId: string }) => Promise<string | null>;
}

@Injectable()
export class MessagesRepository {
  private readonly messagesWriteRepoModule: MessagesWriteRepoModule = requireLegacyModule<MessagesWriteRepoModule>('src/legacy/repos/messagesWriteRepo.js');

  async sendMessage(payload: SendMessageDto): Promise<unknown> {
    return this.messagesWriteRepoModule.sendMessage({
      dataBackend: 'mongo',
      payload,
    });
  }

  async markRead(conversationId: string, userId: string): Promise<number> {
    return this.messagesWriteRepoModule.markRead({
      dataBackend: 'mongo',
      conversationId,
      userId,
    });
  }

  async getUidByUserId(userId: string): Promise<string | null> {
    return this.messagesWriteRepoModule.getUidByUserId({
      dataBackend: 'mongo',
      userId,
    });
  }
}
