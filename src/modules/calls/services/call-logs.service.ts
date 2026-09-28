import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class CallLogsService {
  constructor(
    @InjectModel('CallLog')
    private readonly callLogModel: Model<Record<string, unknown>>,
    @InjectModel('Call')
    private readonly callModel: Model<Record<string, unknown>>,
  ) {}

  async startCallLog(body: Record<string, unknown>): Promise<{ success: boolean; message: string; callId: string }> {
    const {
      callId,
      teacherId,
      teacherName,
      teacherEmail,
      studentId,
      studentName,
      studentEmail,
      direction,
      startTime,
    } = body as Record<string, unknown>;

    if (!callId || !teacherId || !studentId || !direction || !startTime) {
      throw new BadRequestException(
        'Missing required fields: callId, teacherId, studentId, direction, startTime',
      );
    }

    if (!['incoming', 'outgoing'].includes(String(direction))) {
      throw new BadRequestException('Invalid direction. Must be "incoming" or "outgoing"');
    }

    const startedAtDate = new Date(String(startTime));

    await this.callLogModel.updateOne(
      { _id: callId },
      {
        $set: {
          callId,
          teacherId,
          teacherName: teacherName || 'Unknown',
          teacherEmail: teacherEmail || '',
          studentId,
          studentName: studentName || 'Unknown',
          studentEmail: studentEmail || '',
          direction,
          status: 'ongoing',
          startTime,
          startedAt: startedAtDate,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    await this.callModel.updateOne(
      { _id: callId },
      {
        $set: {
          teacherId,
          studentId,
          status: 'ongoing',
          startedAt: startedAtDate,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    return { success: true, message: 'Call log created', callId: String(callId) };
  }

  async endCallLog(body: Record<string, unknown>): Promise<{ success: boolean; message: string; callId: string }> {
    const { callId, endTime, duration, status, endReason, quality } = body as Record<
      string,
      unknown
    >;

    if (!callId || !endTime) {
      throw new BadRequestException('Missing required fields: callId, endTime');
    }

    const validStatuses = ['completed', 'missed', 'rejected', 'failed'];
    if (status && !validStatuses.includes(String(status))) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const existing = await this.callLogModel.findById(callId).lean();
    if (!existing) {
      throw new NotFoundException(
        'Call log not found. Make sure to call /api/call-logs/start first',
      );
    }

    const updateData: Record<string, unknown> = {
      endTime,
      status: status || 'completed',
      updatedAt: new Date().toISOString(),
    };
    if (duration !== undefined) updateData.duration = duration;
    if (endReason) updateData.endReason = endReason;
    if (quality) updateData.quality = quality;

    await this.callLogModel.updateOne({ _id: callId }, { $set: updateData });

    const callUpdate: Record<string, unknown> = {
      status: updateData.status,
      endedAt: new Date(String(endTime)),
      updatedAt: new Date(),
    };
    if (duration !== undefined) callUpdate.duration = duration;

    await this.callModel.updateOne({ _id: callId }, { $set: callUpdate }, { upsert: true });

    return { success: true, message: 'Call log updated', callId: String(callId) };
  }

  async getStudentCallLogs(studentId: string): Promise<unknown> {
    return this.callLogModel
      .find({ studentId })
      .sort({ createdAt: -1 })
      .lean();
  }
}
