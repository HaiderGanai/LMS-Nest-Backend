import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<Record<string, unknown>>,
    @InjectModel('Message')
    private readonly messageModel: Model<Record<string, unknown>>,
    @InjectModel('Call')
    private readonly callModel: Model<Record<string, unknown>>,
  ) {}

  async getUsersOverview(): Promise<{ totalUsers: number; activeUsers: number }> {
    const [totalUsers, activeUsers] = await Promise.all([
      this.userModel.countDocuments({}),
      this.userModel.countDocuments({ isActive: { $ne: false } }),
    ]);
    return { totalUsers, activeUsers };
  }

  async getMessagesOverview(): Promise<{ totalMessages: number; unreadMessages: number }> {
    const [totalMessages, unreadMessages] = await Promise.all([
      this.messageModel.countDocuments({}),
      this.messageModel.countDocuments({
        $or: [{ read: false }, { isRead: false }],
      }),
    ]);
    return { totalMessages, unreadMessages };
  }

  async getCallsOverview(): Promise<{ totalCalls: number; activeCalls: number }> {
    const [totalCalls, activeCalls] = await Promise.all([
      this.callModel.countDocuments({}),
      this.callModel.countDocuments({ status: { $in: ['started', 'connected', 'ongoing'] } }),
    ]);
    return { totalCalls, activeCalls };
  }
}
