import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { SendMessageDto } from '../dto/send-message.dto';
import { CommunicationsRepository } from '../repositories/communications.repository';
import { MessagesRepository } from '../repositories/messages.repository';

interface MessageDocument {
  _id: string;
  conversationId?: string;
  senderId?: string;
  receiverId?: string;
  content?: string;
  text?: string;
  flagged?: boolean;
  read?: boolean;
  isRead?: boolean;
  createdAt?: Date;
  timestamp?: Date | string;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel('Message')
    private readonly messageModel: Model<MessageDocument>,
    private readonly messagesRepository: MessagesRepository,
    private readonly communicationsRepository: CommunicationsRepository,
  ) {}

  async getMessages(query: Record<string, string>): Promise<{
    success: boolean;
    messages: MessageDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const lim = Math.min(parseInt(query.limit || '') || 20, 100);
    const page = Math.max(parseInt(query.page || '') || 1, 1);
    const skip = (page - 1) * lim;

    const filter: Record<string, unknown> = {};
    if (query.flagged !== undefined) filter.flagged = query.flagged === 'true';
    if (query.senderId) filter.senderId = query.senderId;
    if (query.userId) filter.$or = [{ senderId: query.userId }, { receiverId: query.userId }];

    const [messages, total] = await Promise.all([
      this.messageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      this.messageModel.countDocuments(filter),
    ]);

    return { success: true, messages, total, page, totalPages: Math.ceil(total / lim) };
  }

  async updateMessage(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; message: MessageDocument }> {
    const updated = await this.messageModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException('Message not found');
    }
    return { success: true, message: updated };
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    await this.messageModel.findByIdAndDelete(id);
    return { success: true };
  }

  async sendMessage(body: Record<string, unknown>): Promise<unknown> {
    const { senderId, content } = body as Record<string, unknown>;
    let { receiverId } = body as Record<string, unknown>;

    // Derive receiverId from conversationId when not explicitly provided.
    // The legacy repo builds conversationId as [senderId, receiverId].sort().join('_'),
    // so we can reverse it given the known senderId.
    if (!receiverId && senderId && body.conversationId) {
      const convId = body.conversationId as string;
      const sid = senderId as string;
      if (convId.startsWith(sid + '_')) {
        receiverId = convId.slice(sid.length + 1);
      } else if (convId.endsWith('_' + sid)) {
        receiverId = convId.slice(0, convId.length - sid.length - 1);
      }
    }

    if (!senderId || !receiverId || !content) {
      throw new BadRequestException('senderId, receiverId, and content are required');
    }
    return this.messagesRepository.sendMessage({ ...body, receiverId } as unknown as SendMessageDto);
  }

  async markRead(
    conversationId: string,
    userId: string,
  ): Promise<{ success: boolean; markedCount: number }> {
    if (!conversationId || !userId) {
      throw new BadRequestException('conversationId and userId are required');
    }
    const markedCount = await this.messagesRepository.markRead(conversationId, userId);
    return { success: true, markedCount };
  }

  async getStudentMessages(studentId: string, limit = 50): Promise<unknown> {
    return this.communicationsRepository.getStudentMessages(studentId, limit);
  }

  async getStudentConversations(studentId: string): Promise<unknown> {
    return this.communicationsRepository.getStudentConversations(studentId);
  }

  async getConversationMessages(conversationId: string): Promise<unknown> {
    return this.communicationsRepository.getConversationMessages(conversationId);
  }
}
