import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class MessageAlertsService {
  constructor(
    @InjectModel('MessageAlert')
    private readonly messageAlertModel: Model<Record<string, unknown>>,
  ) {}

  async getMessageAlerts(query: {
    limit?: string;
    skip?: string;
    resolved?: string;
    teacherId?: string;
  }): Promise<{ success: boolean; alerts: Record<string, unknown>[] }> {
    const lim = Math.min(parseInt(query.limit || '') || 200, 200);
    const skip = parseInt(query.skip || '') || 0;

    const filter: Record<string, unknown> = {};
    if (query.resolved === 'true') filter.resolved = true;
    if (query.resolved === 'false') filter.resolved = { $ne: true };
    if (query.teacherId) filter.teacherId = query.teacherId;

    const alerts = await this.messageAlertModel
      .find(filter)
      .sort({ timestamp: -1, createdAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    return { success: true, alerts };
  }

  async updateMessageAlert(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; alert: Record<string, unknown> }> {
    const updated = await this.messageAlertModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException('Message alert not found');
    }
    return { success: true, alert: updated };
  }
}
