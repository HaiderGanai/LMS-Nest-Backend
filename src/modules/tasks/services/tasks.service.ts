import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

interface TaskDocument {
  _id: string;
  title: string;
  description?: string;
  type?: 'general' | 'family_specific';
  familyId?: string | null;
  assignedTo?: string | null;
  assignedBy?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate?: Date | null;
  notes?: Array<Record<string, unknown>>;
  replies?: Array<Record<string, unknown>>;
}

interface ListFilter {
  status?: string;
  assignedTo?: string;
  type?: string;
  familyId?: string;
  overdue?: string;
  search?: string;
  limit?: string;
  skip?: string;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async stats(uid: string) {
    const now = new Date();
    const [total, pending, inProgress, completed, overdue, mine, issued] = await Promise.all([
      this.taskModel.countDocuments({ status: { $nin: ['cancelled'] } }),
      this.taskModel.countDocuments({ status: 'pending' }),
      this.taskModel.countDocuments({ status: 'in_progress' }),
      this.taskModel.countDocuments({ status: 'completed' }),
      this.taskModel.countDocuments({ status: { $nin: ['completed', 'cancelled'] }, scheduledDate: { $lt: now } }),
      this.taskModel.countDocuments({ assignedTo: uid, status: { $nin: ['completed', 'cancelled'] } }),
      this.taskModel.countDocuments({ assignedBy: uid, status: { $nin: ['completed', 'cancelled'] } }),
    ]);
    return { total, pending, inProgress, completed, overdue, mine, issued };
  }

  async list(query: ListFilter) {
    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') {
      const arr = query.status.split(',').map(s => s.trim()).filter(Boolean);
      filter.status = arr.length === 1 ? arr[0] : { $in: arr };
    }
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.type) filter.type = query.type;
    if (query.familyId) filter.familyId = query.familyId;
    if (query.overdue === 'true') {
      filter.scheduledDate = { $lt: new Date() };
      filter.status = { $nin: ['completed', 'cancelled'] };
    }
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }
    const limit = Math.min(parseInt(query.limit || '100', 10), 500);
    const skip = parseInt(query.skip || '0', 10);
    const tasks = await this.taskModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await this.taskModel.countDocuments(filter);
    return { tasks, total };
  }

  async get(id: string) {
    const task = await this.taskModel.findById(id).lean();
    if (!task) throw new NotFoundException('Task not found');
    return { task };
  }

  async create(body: Partial<TaskDocument> & { assignedByName?: string }, uid: string, uname?: string) {
    const task = await this.taskModel.create({
      _id: uuidv4(),
      title: body.title,
      description: body.description || '',
      type: body.type || 'general',
      familyId: body.familyId || null,
      assignedTo: body.assignedTo || null,
      assignedBy: uid,
      assignedByName: uname || body.assignedByName || '',
      status: body.status || 'pending',
      scheduledDate: body.scheduledDate || null,
    });
    return { task: task.toObject() };
  }

  async update(id: string, body: Partial<TaskDocument>) {
    const task = await this.taskModel.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!task) throw new NotFoundException('Task not found');
    return { task };
  }

  async remove(id: string) {
    const result = await this.taskModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundException('Task not found');
    return { success: true };
  }

  async addNote(id: string, text: string, uid: string, uname?: string) {
    const note = { text, addedBy: uid, addedByName: uname || '' };
    const task = await this.taskModel.findByIdAndUpdate(
      id,
      { $push: { notes: note } },
      { new: true },
    ).lean();
    if (!task) throw new NotFoundException('Task not found');
    return { task };
  }

  async addReply(id: string, text: string, type: string, uid: string, uname?: string) {
    const reply = { text, type, repliedBy: uid, repliedByName: uname || '' };
    const update: Record<string, unknown> = { $push: { replies: reply } };
    if (type === 'completion') {
      (update as any).$set = { status: 'completed', completedAt: new Date() };
    }
    const task = await this.taskModel.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!task) throw new NotFoundException('Task not found');
    return { task };
  }

  async reschedule(id: string, newDate: Date, reason: string, uid: string, uname?: string) {
    const task = await this.taskModel.findById(id);
    if (!task) throw new NotFoundException('Task not found');
    const previousDate = (task as any).scheduledDate;
    (task as any).scheduledDate = newDate;
    if (!Array.isArray((task as any).dateHistory)) (task as any).dateHistory = [];
    (task as any).dateHistory.push({
      previousDate, newDate, reason, changedBy: uid, changedByName: uname || '', changedAt: new Date(),
    });
    await task.save();
    return { task: task.toObject() };
  }
}
