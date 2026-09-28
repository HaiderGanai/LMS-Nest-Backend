import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface ParentUserDoc {
  _id: string;
  children?: Array<{ studentId?: string; childId?: string }>;
  name?: string;
  email?: string;
}

@Injectable()
export class ParentService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<ParentUserDoc>,
    @InjectModel('Student')
    private readonly studentModel: Model<any>,
    @InjectModel('CallAlert')
    private readonly callAlertModel: Model<any>,
    @InjectModel('DailyClass')
    private readonly dailyClassModel: Model<any>,
  ) {}

  private async getChildIds(parentId: string): Promise<string[]> {
    const parentDoc = await this.userModel.findById(parentId).lean();
    if (!parentDoc) throw new NotFoundException('Parent not found');

    const childIds = new Set<string>();
    const parentChildren = Array.isArray(parentDoc.children) ? parentDoc.children : [];
    parentChildren.forEach((c) => {
      const sid = String(c?.studentId || c?.childId || '').trim();
      if (sid) childIds.add(sid);
    });
    const studentDocs = await this.studentModel.find({ parentId }).lean();
    studentDocs.forEach((doc: any) => {
      const sid = String(doc?._id || '').trim();
      if (sid) childIds.add(sid);
    });
    return Array.from(childIds);
  }

  async getAlerts(parentId: string) {
    const childIdList = await this.getChildIds(parentId);
    if (childIdList.length === 0) return { alerts: [] };

    const docs = await this.callAlertModel.find({
      studentId: { $in: childIdList },
      type: { $nin: ['schedule_request_accepted', 'schedule_request_rejected'] },
      'raw.alertCategory': { $ne: 'scheduling' },
      'raw.alertSource': { $ne: 'schedule_assignment_request' },
      'raw.source': { $ne: 'schedule_assignment_request' },
    })
      .sort({ timestamp: -1, createdAt: -1, _id: -1 })
      .limit(50)
      .lean();

    const alerts = docs.map((doc: any) => ({
      id: doc._id,
      ...doc,
      createdAt: doc.createdAt || doc.timestamp || new Date().toISOString(),
    }));
    return { alerts };
  }

  async getTodayClasses(parentId: string) {
    const childIdList = await this.getChildIds(parentId);
    if (childIdList.length === 0) return { classes: [] };

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const classes = await this.dailyClassModel.find({
      studentId: { $in: childIdList },
      adminDate: today,
    })
      .sort({ scheduledTime: 1 })
      .lean();
    return { classes };
  }

  async getStudentSchedule(parentId: string, studentId: string, query: { from?: string; to?: string }) {
    const childIdList = await this.getChildIds(parentId);
    if (!childIdList.includes(studentId)) {
      throw new NotFoundException('Student not associated with this parent');
    }
    const filter: Record<string, unknown> = { studentId };
    if (query.from || query.to) {
      const range: Record<string, string> = {};
      if (query.from) range.$gte = query.from;
      if (query.to) range.$lte = query.to;
      filter.adminDate = range;
    }
    const schedule = await this.dailyClassModel.find(filter).sort({ adminDate: 1, scheduledTime: 1 }).lean();
    return { schedule };
  }

  async leaveClass(parentId: string, classId: string, reason?: string) {
    const childIdList = await this.getChildIds(parentId);
    const cls = await this.dailyClassModel.findById(classId).lean() as any;
    if (!cls) throw new NotFoundException('Class not found');
    if (!childIdList.includes(cls.studentId)) {
      throw new NotFoundException('Class does not belong to this parent');
    }
    await this.dailyClassModel.updateOne(
      { _id: classId },
      {
        $set: {
          status: 'cancelled_by_parent',
          cancelledBy: parentId,
          cancelReason: reason || 'Marked leave by parent',
          cancelledAt: new Date(),
        },
      },
    );
    return { success: true };
  }
}
