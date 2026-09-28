import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

interface AnnouncementDocument {
  _id: string;
  title?: string;
  body?: string;
  audience?: 'all' | 'students' | 'teachers' | 'parents' | 'staff';
  scheduledFor?: Date | null;
  expiresAt?: Date | null;
  isActive?: boolean;
  createdBy?: string;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectModel('Announcement')
    private readonly announcementModel: Model<AnnouncementDocument>,
  ) {}

  async list(query: { audience?: string; active?: string; limit?: string; skip?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.audience) filter.audience = query.audience;
    if (query.active === 'true') filter.isActive = true;
    const limit = Math.min(parseInt(query.limit || '100', 10), 500);
    const skip = parseInt(query.skip || '0', 10);
    const items = await this.announcementModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await this.announcementModel.countDocuments(filter);
    return { announcements: items, total };
  }

  async active(audience?: string) {
    const now = new Date();
    const filter: Record<string, unknown> = {
      isActive: true,
      $or: [
        { scheduledFor: { $lte: now } },
        { scheduledFor: null },
      ],
    };
    if (audience) filter.audience = { $in: [audience, 'all'] };
    const items = await this.announcementModel.find(filter).sort({ createdAt: -1 }).lean();
    return { announcements: items };
  }

  async get(id: string) {
    const item = await this.announcementModel.findById(id).lean();
    if (!item) throw new NotFoundException('Announcement not found');
    return { announcement: item };
  }

  async create(body: Partial<AnnouncementDocument>, uid: string) {
    const created = await this.announcementModel.create({
      _id: uuidv4(),
      title: body.title,
      body: body.body || '',
      audience: body.audience || 'all',
      scheduledFor: body.scheduledFor || null,
      expiresAt: body.expiresAt || null,
      isActive: body.isActive !== false,
      createdBy: uid,
    });
    return { announcement: created.toObject() };
  }

  async update(id: string, body: Partial<AnnouncementDocument>) {
    const item = await this.announcementModel.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!item) throw new NotFoundException('Announcement not found');
    return { announcement: item };
  }

  async remove(id: string) {
    const result = await this.announcementModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundException('Announcement not found');
    return { success: true };
  }
}
