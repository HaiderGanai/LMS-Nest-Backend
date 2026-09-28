import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { CallStateService } from './call-state.service';

interface CallDocument {
  _id: string;
  teacherId?: string;
  studentId?: string;
  roomId?: string;
  status?: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt?: Date;
}

@Injectable()
export class CallsService {
  constructor(
    @InjectModel('Call')
    private readonly callModel: Model<CallDocument>,
    @InjectModel('CallTelemetryEvent')
    private readonly callTelemetryEventModel: Model<Record<string, unknown>>,
    private readonly callStateService: CallStateService,
  ) {}

  async getCalls(query: Record<string, string>): Promise<{
    success: boolean;
    calls: CallDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const lim = Math.min(parseInt(query.limit || '') || 20, 100);
    const page = Math.max(parseInt(query.page || '') || 1, 1);
    const skip = (page - 1) * lim;

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.teacherId) filter.teacherId = query.teacherId;

    const [calls, total] = await Promise.all([
      this.callModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      this.callModel.countDocuments(filter),
    ]);

    return { success: true, calls, total, page, totalPages: Math.ceil(total / lim) };
  }

  async getCallById(callId: string): Promise<{ success: boolean; call: CallDocument }> {
    const call = await this.callModel.findById(callId).lean();
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    return { success: true, call };
  }

  async getCallTelemetry(
    callId: string,
    query: Record<string, string> = {},
  ): Promise<{ success: boolean; callId: string; count: number; events: Record<string, unknown>[] }> {
    const callIdStr = String(callId || '').trim();
    if (!callIdStr) {
      throw new BadRequestException('callId is required');
    }

    const lim = Math.min(parseInt(query.limit || '') || 200, 1000);

    const filter: Record<string, unknown> = { callId: callIdStr };
    if (query.severity) filter.severity = String(query.severity).toLowerCase();
    if (query.category) filter.category = String(query.category).toLowerCase();

    const events = await this.callTelemetryEventModel
      .find(filter)
      .sort({ eventAt: -1, createdAt: -1 })
      .limit(lim)
      .lean();

    return { success: true, callId: callIdStr, count: events.length, events };
  }

  async updateCall(
    callId: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; call: CallDocument }> {
    const updated = await this.callModel
      .findByIdAndUpdate(callId, { $set: body }, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException('Call not found');
    }
    return { success: true, call: updated };
  }

  async forceEndCall(body: Record<string, unknown>): Promise<{ success: boolean }> {
    const callId = String(body.callId || '').trim();
    const teacherId = String(body.teacherId || '').trim();
    const studentId = String(body.studentId || '').trim();

    if (!callId) {
      throw new BadRequestException('callId is required');
    }
    if (!teacherId) {
      throw new BadRequestException('teacherId is required');
    }
    if (!studentId) {
      throw new BadRequestException('studentId is required');
    }

    // Update call status in DB
    await this.callModel.updateOne(
      { _id: callId },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    // Remove from in-memory active calls
    this.callStateService.deleteActiveCall(callId);

    return { success: true };
  }

  getActiveCalls(): { activeCalls: ReturnType<CallStateService['getActiveCalls']> } {
    return { activeCalls: this.callStateService.getActiveCalls() };
  }
}
