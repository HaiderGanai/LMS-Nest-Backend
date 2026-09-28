import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { CreateCourseDto } from '../dto/create-course.dto';
import type { UpdateCourseDto } from '../dto/update-course.dto';

interface CourseDocument {
  _id: string;
  name: string;
  displayName: string;
  position: number;
  minAge: number;
  category: 'regular' | 'addition' | 'learning';
  description?: string;
  stars?: number;
  isActive?: boolean;
}

interface StudentDocument {
  _id: string;
  assignedCourses?: string[];
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel('Course')
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel('Student')
    private readonly studentModel: Model<StudentDocument>,
  ) {}

  async list(category?: string): Promise<{ success: true; courses: CourseDocument[] }> {
    const filter: Record<string, unknown> = { isActive: true };
    if (category) filter.category = category;
    const courses = await this.courseModel
      .find(filter)
      .sort({ category: 1, position: 1 })
      .lean();
    return { success: true, courses };
  }

  async create(body: CreateCourseDto): Promise<{ success: true; course: CourseDocument }> {
    if (!body.name || !body.displayName || !body.category) {
      throw new BadRequestException('name, displayName, category required');
    }
    const course = await this.courseModel.create({
      name: body.name,
      displayName: body.displayName,
      position: body.position ?? 1,
      minAge: body.minAge ?? 1,
      category: body.category,
      description: body.description ?? '',
      stars: body.stars ?? 4,
    });
    return { success: true, course: course.toObject() };
  }

  async update(id: string, body: UpdateCourseDto): Promise<{ success: true; course: CourseDocument }> {
    const course = await this.courseModel.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!course) throw new NotFoundException('Course not found');
    return { success: true, course };
  }

  async softDelete(id: string): Promise<{ success: true }> {
    const result = await this.courseModel.updateOne({ _id: id }, { $set: { isActive: false } });
    if (result.matchedCount === 0) throw new NotFoundException('Course not found');
    return { success: true };
  }

  async assignToStudent(studentId: string, courseIds: string[]): Promise<{ success: true; assignedCourses: string[] }> {
    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');
    await this.studentModel.updateOne({ _id: studentId }, { $set: { assignedCourses: courseIds } });
    return { success: true, assignedCourses: courseIds };
  }

  async getStudentCourses(studentId: string): Promise<{ success: true; courses: CourseDocument[] }> {
    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');
    const courseIds = student.assignedCourses || [];
    if (courseIds.length === 0) return { success: true, courses: [] };
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds }, isActive: true })
      .lean();
    return { success: true, courses };
  }
}
