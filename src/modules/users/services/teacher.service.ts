import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface UserDocument {
  _id: string;
  role?: string;
  isActive?: boolean;
}

@Injectable()
export class TeacherService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,
    @InjectModel('FamilyMember')
    private readonly familyMemberModel: Model<any>,
    @InjectModel('Student')
    private readonly studentModel: Model<any>,
  ) {}

  async getTeacherUsers(): Promise<{ teachers: UserDocument[] }> {
    const teachers = await this.userModel
      .find({ role: 'teacher', isActive: { $ne: false } })
      .sort({ createdAt: -1 })
      .lean();
    return { teachers };
  }

  async getTeachers(): Promise<{ teachers: any[] }> {
    const teachers = await this.userModel
      .find({ role: 'teacher', isActive: { $ne: false } })
      .sort({ name: 1 })
      .lean();

    const teachersWithStatus = teachers.map((t) => ({ ...t, isOnline: false }));
    return { teachers: teachersWithStatus };
  }

  async getTeacherById(teacherId: string): Promise<any> {
    const normalized = String(teacherId || '').trim();
    if (!normalized) throw new NotFoundException('Teacher not found');

    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const teacher = await this.userModel.findOne({
      role: 'teacher',
      $or: [
        { _id: normalized },
        { uid: normalized },
        { email: { $regex: `^${escaped}$`, $options: 'i' } },
      ],
    }).lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if ((teacher as any).isActive === false) {
      throw new ForbiddenException('Teacher account disabled');
    }

    return { ...(teacher as any), id: (teacher as any)._id, isOnline: false };
  }

  async getTeacherStudents(teacherId: string): Promise<{ students: any[] }> {
    const [familyMemberStudents, directStudents] = await Promise.all([
      this.familyMemberModel
        .find({ assignedTeacher: teacherId, role: 'student' })
        .lean(),
      this.studentModel
        .find({ assignedTeacher: teacherId })
        .lean(),
    ]);

    // Merge and deduplicate by _id, family member records take precedence
    const merged = new Map<string, any>();
    for (const s of directStudents) {
      merged.set(String((s as any)._id), s);
    }
    for (const s of familyMemberStudents) {
      merged.set(String((s as any)._id), s);
    }

    return { students: Array.from(merged.values()) };
  }
}
