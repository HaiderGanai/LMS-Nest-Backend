import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class VideoAlertsService {
  constructor(
    @InjectModel('VideoAlert')
    private readonly videoAlertModel: Model<Record<string, unknown>>,
    @InjectModel('CallAlert')
    private readonly callAlertModel: Model<Record<string, unknown>>,
  ) {}

  async getVideoAlerts(): Promise<{ alerts: Record<string, unknown>[] }> {
    const alerts = await this.videoAlertModel.find({}).sort({ createdAt: -1 }).lean();
    return { alerts };
  }

  /**
   * POST /api/safety-alert  -> call_alerts collection
   * POST /api/video-alert   -> video_alerts collection
   */
  async createVideoAlert(
    body: Record<string, unknown>,
    isVideoAlert = false,
  ): Promise<{ success: boolean; id: string; message: string }> {
    const {
      alertCategory,
      alertSource,
      callId,
      communicationType,
      contentType,
      createdAt,
      detectionSource,
      flagged,
      immediateAlert,
      reason,
      receiverId,
      resolved,
      senderId,
      sessionId,
      severity,
      source,
      studentId,
      teacherEmail,
      teacherId,
      teacherName,
      type,
      userRole,
      transcript,
      confidence,
      patternMatched,
      languageCode,
    } = body as Record<string, unknown>;

    if (!callId || !teacherId || !severity) {
      throw new Error('Missing required fields: callId, teacherId, severity');
    }

    const alertId = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const alertData = {
      alertCategory: alertCategory || 'teacher_monitoring',
      alertSource: alertSource || 'call',
      callId,
      communicationType: communicationType || 'call',
      contentType: contentType || 'speech_monitoring',
      createdAt: createdAt || new Date().toISOString(),
      detectionSource: detectionSource || 'live_transcription',
      flagged: flagged !== undefined ? flagged : true,
      immediateAlert:
        immediateAlert !== undefined ? immediateAlert : severity === 'high',
      reason: reason || 'Pattern detected in speech',
      receiverId: receiverId || studentId || 'unknown_student',
      resolved: resolved !== undefined ? resolved : false,
      senderId: senderId || teacherId,
      sessionId: sessionId || callId,
      severity,
      source: source || 'live_transcription',
      studentId: studentId || 'unknown_student',
      teacherEmail: teacherEmail || 'unknown@example.com',
      teacherId,
      teacherName: teacherName || teacherId || 'Teacher',
      timestamp: new Date(),
      type: type || 'inappropriate_content',
      userRole: userRole || 'teacher',
      transcript: transcript || '',
      confidence: confidence || 0,
      patternMatched: patternMatched || null,
      languageCode: languageCode || 'en-US',
    };

    if (isVideoAlert) {
      await this.videoAlertModel.create({ _id: alertId, ...alertData });
    } else {
      await this.callAlertModel.create({ _id: alertId, ...alertData });
    }

    return { success: true, id: alertId, message: 'Safety alert saved successfully' };
  }
}
