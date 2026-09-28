import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class ActionLogsService {
  constructor(
    @InjectModel('ActionLog')
    private readonly actionLogModel: Model<any>,
  ) {}

  async list(query: {
    userId?: string;
    action?: string;
    target?: string;
    from?: string;
    to?: string;
    limit?: string;
    skip?: string;
  }) {
    const filter: Record<string, unknown> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.action) filter.action = query.action;
    if (query.target) filter.target = query.target;
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) range.$lte = new Date(query.to);
      filter.createdAt = range;
    }
    const limit = Math.min(parseInt(query.limit || '100', 10), 500);
    const skip = parseInt(query.skip || '0', 10);
    const items = await this.actionLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await this.actionLogModel.countDocuments(filter);
    return { logs: items, total };
  }

  async stats() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [total, today, thisWeek] = await Promise.all([
      this.actionLogModel.countDocuments({}),
      this.actionLogModel.countDocuments({ createdAt: { $gte: dayAgo } }),
      this.actionLogModel.countDocuments({ createdAt: { $gte: weekAgo } }),
    ]);
    return { total, today, thisWeek };
  }
}
