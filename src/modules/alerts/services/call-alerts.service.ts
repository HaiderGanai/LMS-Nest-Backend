import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class CallAlertsService {
  constructor(
    @InjectModel('CallAlert')
    private readonly callAlertModel: Model<Record<string, unknown>>,
    @InjectModel('VideoAlert')
    private readonly videoAlertModel: Model<Record<string, unknown>>,
    @InjectModel('MessageAlert')
    private readonly messageAlertModel: Model<Record<string, unknown>>,
  ) {}

  async listAlerts(query: {
    limit?: string;
    skip?: string;
    teacherId?: string;
    severity?: string;
    since?: string;
    status?: string;
  }): Promise<{ success: boolean; alerts: Record<string, unknown>[] }> {
    const lim = Math.min(parseInt(query.limit || '') || 50, 200);
    const skip = Math.max(parseInt(query.skip || '') || 0, 0);

    const baseFilter: Record<string, unknown> = {};
    if (query.teacherId) baseFilter.teacherId = query.teacherId;
    if (query.severity) baseFilter.severity = query.severity;
    if (query.since) {
      const sinceDate = new Date(query.since);
      if (!Number.isNaN(sinceDate.getTime())) {
        baseFilter.$or = [
          { createdAt: { $gte: sinceDate } },
          { timestamp: { $gte: sinceDate } },
        ];
      }
    }

    const resolvedFilter = { $or: [{ resolved: true }, { reviewed: true }] };
    const unresolvedFilter = {
      $and: [
        { $or: [{ resolved: { $exists: false } }, { resolved: { $ne: true } }] },
        { $or: [{ reviewed: { $exists: false } }, { reviewed: { $ne: true } }] },
      ],
    };

    let statusFilter: Record<string, unknown> = {};
    if (query.status === 'resolved') statusFilter = resolvedFilter;
    if (query.status === 'unresolved') statusFilter = unresolvedFilter;

    const filter = { ...baseFilter, ...statusFilter };

    const alerts = await this.callAlertModel.aggregate([
      { $match: filter },
      {
        $addFields: {
          _collection: 'call_alerts',
          _sortTs: { $ifNull: ['$createdAt', '$timestamp'] },
        },
      },
      {
        $unionWith: {
          coll: 'video_alerts',
          pipeline: [
            { $match: filter },
            {
              $addFields: {
                _collection: 'video_alerts',
                _sortTs: { $ifNull: ['$createdAt', '$timestamp'] },
              },
            },
          ],
        },
      },
      {
        $unionWith: {
          coll: 'message_alerts',
          pipeline: [
            { $match: filter },
            {
              $addFields: {
                _collection: 'message_alerts',
                _sortTs: { $ifNull: ['$createdAt', '$timestamp'] },
                reason: { $ifNull: ['$raw.reason', '$reason'] },
                type: { $ifNull: ['$raw.type', '$type'] },
                pattern: { $ifNull: ['$pattern', '$patternMatched'] },
                teacherName: { $ifNull: ['$raw.teacherName', '$teacherName'] },
                alertSource: 'message',
                communicationType: 'message',
              },
            },
          ],
        },
      },
      { $sort: { _sortTs: -1, _id: -1 } },
      { $skip: skip },
      { $limit: lim },
      { $project: { _sortTs: 0 } },
    ]).allowDiskUse(true);

    return { success: true, alerts };
  }

  async deleteAllAlerts(): Promise<{ success: boolean; deleted: Record<string, number> }> {
    const [callResult, videoResult, messageResult] = await Promise.all([
      this.callAlertModel.deleteMany({}),
      this.videoAlertModel.deleteMany({}),
      this.messageAlertModel.deleteMany({}),
    ]);

    const deleted = {
      callAlerts: Number(callResult?.deletedCount || 0),
      videoAlerts: Number(videoResult?.deletedCount || 0),
      messageAlerts: Number(messageResult?.deletedCount || 0),
      total: 0,
    };
    deleted.total = deleted.callAlerts + deleted.videoAlerts + deleted.messageAlerts;

    return { success: true, deleted };
  }

  async updateAlert(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; alert: Record<string, unknown> }> {
    let updated = await this.callAlertModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean();
    if (!updated) {
      updated = await this.videoAlertModel
        .findByIdAndUpdate(id, { $set: body }, { new: true })
        .lean();
    }
    if (!updated) {
      updated = await this.messageAlertModel
        .findByIdAndUpdate(id, { $set: body }, { new: true })
        .lean();
    }
    if (!updated) {
      throw new NotFoundException('Alert not found');
    }
    return { success: true, alert: updated };
  }

  async deleteAlert(id: string): Promise<{ success: boolean }> {
    const deletedCall = await this.callAlertModel.findByIdAndDelete(id).lean();
    if (!deletedCall) {
      const deletedVideo = await this.videoAlertModel.findByIdAndDelete(id).lean();
      if (!deletedVideo) {
        await this.messageAlertModel.findByIdAndDelete(id).lean();
      }
    }
    return { success: true };
  }

  async createCallAlert(
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; id: string; alertId: string; message: string }> {
    const alertId = `va_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const {
      teacherId,
      teacherName,
      studentId,
      studentName,
      detectedPattern,
      matchedKeywords,
      confidenceScore,
      source,
      screenshot,
      timestamp,
      status,
      reviewed,
      alertType,
      severity,
      metadata,
    } = body as Record<string, unknown>;

    if (!teacherId || !teacherName || !detectedPattern) {
      throw new Error('Missing required fields: teacherId, teacherName, detectedPattern');
    }

    await this.videoAlertModel.create({
      _id: alertId,
      teacherId,
      teacherName,
      studentId: studentId || null,
      studentName: studentName || null,
      detectedPattern,
      matchedKeywords: matchedKeywords || [],
      confidenceScore: confidenceScore || 0,
      source: source || 'camera',
      screenshot: screenshot || null,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date(),
      status: status || 'new',
      reviewed: reviewed !== undefined ? reviewed : false,
      reviewedBy: null,
      reviewedAt: null,
      notes: null,
      alertType: alertType || 'pattern_detection',
      severity: severity || 'medium',
      metadata: metadata || {
        appVersion: '1.0.0',
        platform: 'teacher-desktop-windows-client',
        ocrEngine: 'tesseract-client-side',
      },
    });

    return {
      success: true,
      id: alertId,
      alertId,
      message: 'Pattern detection alert saved successfully',
    };
  }

  async updateCallAlert(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ message: string; alert: Record<string, unknown> }> {
    const updated = await this.callAlertModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException('Call alert not found');
    }
    return { message: 'Call alert updated successfully', alert: updated };
  }

  async deleteCallAlert(id: string): Promise<{ message: string }> {
    const result = await this.callAlertModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Call alert not found');
    }
    return { message: 'Call alert deleted successfully' };
  }
}
