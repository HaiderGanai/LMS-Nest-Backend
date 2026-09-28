import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AlertPatternsService {
  constructor(
    @InjectModel('AlertPattern')
    private readonly model: Model<any>,
  ) {}

  async list() {
    const items = await this.model.find({}).sort({ createdAt: -1 }).lean();
    return { patterns: items };
  }

  async create(body: any) {
    if (!body.pattern || !body.severity || !body.type || !body.reason) {
      throw new BadRequestException('pattern, severity, type, reason required');
    }
    try { new RegExp(body.pattern); } catch { throw new BadRequestException('Invalid regex pattern'); }
    const doc = await this.model.create({
      _id: uuidv4(),
      pattern: body.pattern,
      severity: body.severity,
      type: body.type,
      reason: body.reason,
      language: body.language || 'en',
      enabled: body.enabled !== false,
    });
    return { success: true, pattern: doc.toObject() };
  }

  async update(id: string, body: any) {
    if (body.pattern) {
      try { new RegExp(body.pattern); } catch { throw new BadRequestException('Invalid regex pattern'); }
    }
    const doc = await this.model.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!doc) throw new NotFoundException('Pattern not found');
    return { success: true, pattern: doc };
  }

  async remove(id: string) {
    const result = await this.model.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundException('Pattern not found');
    return { success: true };
  }
}
