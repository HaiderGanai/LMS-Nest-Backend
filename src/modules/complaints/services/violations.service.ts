import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class ViolationsService {
  constructor(
    @InjectModel('Violation')
    private readonly violationModel: Model<Record<string, unknown>>,
  ) {}

  async getViolationsByCallId(callId: string): Promise<{ violations: Record<string, unknown>[] }> {
    const violations = await this.violationModel.find({ callId }).sort({ createdAt: -1 }).lean();
    return { violations };
  }
}
