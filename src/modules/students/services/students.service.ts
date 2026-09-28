import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { UpdateStudentDto } from '../dto/update-student.dto';
import { StudentsRepository } from '../repositories/students.repository';
import { v4 as uuidv4 } from 'uuid';

interface StudentDocument {
  _id: string;
  studentId?: string;
  parentId?: string;
  name?: string;
  email?: string;
  assignedTeacher?: string;
  isActive?: boolean;
  isOnline?: boolean;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel('Student')
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel('User')
    private readonly userModel: Model<StudentDocument>,
    @InjectModel('CallLog')
    private readonly callLogModel: Model<any>,
    private readonly studentsRepository: StudentsRepository,
  ) {}

  async getStudents(): Promise<{ students: StudentDocument[] }> {
    const students = await this.studentModel.find({}).sort({ createdAt: -1 }).lean();
    return { students };
  }

  async getStudentById(id: string): Promise<{ student: unknown }> {
    const student = await this.studentsRepository.getStudentProfile(id);
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return { student };
  }

  async updateStudent(id: string, body: UpdateStudentDto): Promise<{ message: string; student: StudentDocument }> {
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([_, value]) => value !== undefined),
    );

    const result = await this.studentModel.updateOne({ _id: id }, { $set: updateData });
    if (result.matchedCount === 0) {
      throw new NotFoundException('Student not found');
    }

    const updatedStudent = await this.studentModel.findById(id).lean();
    if (!updatedStudent) {
      throw new NotFoundException('Student not found after update');
    }

    return { message: 'Student updated successfully', student: updatedStudent };
  }

  async listStudentsByParentId(parentId: string): Promise<{ students: StudentDocument[] }> {
    const students = await this.studentModel.find({ parentId, isActive: { $ne: false } }).lean();
    return { students };
  }

  async createStudent(body: Record<string, unknown>) {
  try {
    const id = uuidv4();

    const email = body.email ? String(body.email).trim().toLowerCase() : null;

    // 🔹 Email uniqueness check only if email exists
    if (email) {
      const existingEmail = await this.studentModel.findOne({ email }).lean();
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const created = await this.studentModel.create({
      _id: id,
      studentId: body.studentId || null,
      email,
      name: body.name,
      ...(body as any), // optional: only safe if schema is controlled
    });

    return {
      message: 'Student created successfully',
      student: created,
    };

  } catch (error: any) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      throw new BadRequestException(`${field} already exists`);
    }

    throw error;
  }
}

  async deleteStudent(studentId: string): Promise<{ message: string }> {
    const result = await this.studentModel.deleteOne({ _id: studentId });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Student not found');
    }
    return { message: 'Student deleted successfully' };
  }

  async setActiveStudent(parentId: string, studentId: string): Promise<{ message: string }> {
    await this.userModel.updateOne(
      { _id: parentId },
      { $set: { activeStudentId: studentId } },
    );
    return { message: 'Active student updated successfully' };
  }

  async assignStudentTeacher(studentId: string, teacherId: string): Promise<{ message: string; student: StudentDocument }> {
    await this.studentModel.updateOne(
      { _id: studentId },
      { $set: { assignedTeacher: teacherId } },
    );

    const updatedStudent = await this.studentModel.findById(studentId).lean();
    if (!updatedStudent) {
      throw new NotFoundException('Student not found after teacher assignment');
    }

    return { message: 'Teacher assigned successfully', student: updatedStudent };
  }

  async getStudentProfile(studentId: string): Promise<{ student: unknown }> {
    return this.getStudentById(studentId);
  }

  async getStudentDiaryNotes(studentId: string, limit = 10): Promise<{ notes: unknown[] }> {
    const student = await this.studentModel.findById(studentId).lean() as any;
    if (!student) return { notes: [] };
    const parentId = student.parentId;
    if (!parentId) return { notes: [] };

    const parent = await this.userModel.findById(parentId).lean() as any;
    if (!parent) return { notes: [] };

    const allNotes = Array.isArray(parent.diaryNotes) ? parent.diaryNotes : [];
    const filtered = allNotes
      .filter((n: any) => !n.studentId || n.studentId === studentId)
      .sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
      .slice(0, limit)
      .map((n: any) => ({
        id: n.id,
        studentId: n.studentId || null,
        title: n.title || 'Daily Note',
        content: n.content || n.note || '',
        date: new Date(n.createdAt || n.date || Date.now()),
        createdByName: n.createdBy?.name || n.createdBy?.email || 'Teacher',
        category: n.category || 'general',
        createdAt: new Date(n.createdAt || n.date || Date.now()),
      }));

    return { notes: filtered };
  }

  async getStudentCallLogs(studentId: string, limit = 10, offset = 0): Promise<{ callLogs: unknown[] }> {
    const callLogs = await this.callLogModel
      .find({ studentId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
    return { callLogs };
  }
}
