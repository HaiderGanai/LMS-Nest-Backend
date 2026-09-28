import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface ConversationDocument {
  _id: string;
  participants?: string[];
  lastMessageTime?: Date | string;
  unreadCount?: Record<string, number>;
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel('Conversation')
    private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  async getConversations(userId?: string): Promise<{ conversations: ConversationDocument[] }> {
    // 1. Build optional participant filter for current user context
    const filters = userId ? { participants: userId } : {};

    // 2. Return latest conversations ordered by most recent activity
    const conversations = await this.conversationModel
      .find(filters)
      .sort({ lastMessageTime: -1, updatedAt: -1 })
      .lean();

    return { conversations };
  }
}
