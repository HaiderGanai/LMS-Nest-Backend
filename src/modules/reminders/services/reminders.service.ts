import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RemindersService {
  constructor(
    @InjectModel('Reminder')
    private readonly reminderModel: Model<any>,
  ) {}

  async list(uid: string, query: { status?: string; scope?: string }) {
    const filter: Record<string, unknown> = {};
    const status = query.status || 'pending';
    const scope = query.scope || 'mine';
    if (status !== 'all') filter.status = status;
    if (scope === 'mine') filter.assignedTo = uid;
    else if (scope === 'created') filter.createdBy = uid;
    const items = await this.reminderModel.find(filter).sort({ dueAt: 1, createdAt: -1 }).lean();
    return { reminders: items };
  }

  async create(body: any, uid: string, uname?: string) {
    const item = await this.reminderModel.create({
      _id: uuidv4(),
      title: body.title,
      description: body.description || '',
      assignedTo: body.assignedTo || uid,
      assignedToName: body.assignedToName || '',
      createdBy: uid,
      createdByName: uname || '',
      dueAt: body.dueAt || null,
      status: body.status || 'pending',
    });
    return { reminder: item.toObject() };
  }

  async update(id: string, body: any) {
    const item = await this.reminderModel.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!item) throw new NotFoundException('Reminder not found');
    return { reminder: item };
  }

  async remove(id: string) {
    const result = await this.reminderModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundException('Reminder not found');
    return { success: true };
  }
}
