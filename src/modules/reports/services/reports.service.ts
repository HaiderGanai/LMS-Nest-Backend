import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface FamilyDoc {
  _id: string;
  parentName?: string;
  registrationCode?: string;
  email?: string;
  primaryMobile?: string;
  secondaryMobile?: string;
  country?: string;
  city?: string;
  timezone?: string;
  status?: string;
  createdAt?: Date;
}

interface FamilyMemberDoc {
  _id: string;
  uid?: string;
  studentId?: string;
  familyId?: string;
  name?: string;
  assignedTeacher?: string;
  assignedTeacherName?: string;
  role?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel('Family')
    private readonly familyModel: Model<FamilyDoc>,
    @InjectModel('FamilyMember')
    private readonly familyMemberModel: Model<FamilyMemberDoc>,
    @InjectModel('DailyClass')
    private readonly dailyClassModel: Model<any>,
    @InjectModel('Salary')
    private readonly salaryModel: Model<any>,
  ) {}

  async familyFilter(query: { country?: string; status?: string; search?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.country) filter.country = query.country;
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { parentName: new RegExp(query.search, 'i') },
        { email: new RegExp(query.search, 'i') },
        { registrationCode: new RegExp(query.search, 'i') },
      ];
    }

    const families = await this.familyModel
      .find(filter, 'parentName registrationCode email primaryMobile secondaryMobile country city timezone status createdAt')
      .sort({ registrationCode: 1 })
      .lean();

    const famIds = families.map(f => f._id);
    const memberCounts = await this.familyMemberModel.aggregate([
      { $match: { familyId: { $in: famIds }, role: { $ne: 'parent' } } },
      { $group: { _id: '$familyId', count: { $sum: 1 } } },
    ]);
    const memberCountMap: Record<string, number> = {};
    memberCounts.forEach((m: any) => { memberCountMap[m._id] = m.count; });

    const countries = await this.familyModel.distinct('country', { country: { $ne: null } });

    const rows = families.map(f => ({
      _id: f._id,
      registrationCode: f.registrationCode || '',
      parentName: f.parentName || '',
      email: f.email || '',
      primaryMobile: f.primaryMobile || '',
      secondaryMobile: f.secondaryMobile || '',
      country: f.country || '',
      city: f.city || '',
      timezone: f.timezone || '',
      status: f.status || '',
      studentCount: memberCountMap[f._id] || 0,
      createdAt: f.createdAt,
    }));

    return {
      rows,
      total: rows.length,
      countries: (countries as string[]).filter(Boolean).sort(),
    };
  }

  async studentTeacher(query: { teacherId?: string; from?: string; to?: string }) {
    const classDateFilter: Record<string, unknown> = {};
    if (query.from || query.to) {
      const range: Record<string, string> = {};
      if (query.from) range.$gte = query.from;
      if (query.to) range.$lte = query.to;
      classDateFilter.adminDate = range;
    }

    let allowedBqtIds: string[] | null = null;
    if (query.teacherId) {
      const rows = await this.dailyClassModel.find({ teacherId: query.teacherId, ...classDateFilter }, 'studentId').lean();
      allowedBqtIds = [...new Set(rows.map((r: any) => r.studentId).filter(Boolean))];
      const assignedMembers = await this.familyMemberModel.find({ assignedTeacher: query.teacherId }, 'studentId').lean();
      const assignedBqts = assignedMembers.map((m: any) => m.studentId).filter(Boolean);
      allowedBqtIds = [...new Set([...allowedBqtIds, ...assignedBqts])];
      if (allowedBqtIds.length === 0) return { students: [], total: 0 };
    }

    const memberQuery = allowedBqtIds ? { studentId: { $in: allowedBqtIds } } : {};
    const allMembers = await this.familyMemberModel.find(
      query.teacherId ? { $or: [memberQuery, { assignedTeacher: query.teacherId }] } : {},
      'uid name studentId familyId assignedTeacher assignedTeacherName role',
    ).lean();

    if (allMembers.length === 0) return { students: [], total: 0 };

    const familyIds = [...new Set(allMembers.map((m: any) => m.familyId).filter(Boolean))];
    const families = await this.familyModel.find({ _id: { $in: familyIds } }, 'parentName name status').lean();
    const familyMap: Record<string, any> = {};
    families.forEach((f: any) => { familyMap[f._id] = f; });

    const students = allMembers.map((m: any) => {
      const fam = familyMap[m.familyId] || {};
      return {
        memberId: m._id,
        studentId: m.studentId || '',
        name: m.name || '',
        familyId: m.familyId,
        parentName: fam.parentName || '',
        familyStatus: fam.status || '',
        assignedTeacher: m.assignedTeacher || '',
        assignedTeacherName: m.assignedTeacherName || '',
      };
    });

    return { students, total: students.length };
  }

  async classSalary(query: { from?: string; to?: string; employeeId?: string; status?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      const range: Record<string, string> = {};
      if (query.from) range.$gte = query.from;
      if (query.to) range.$lte = query.to;
      filter.month = range;
    }
    if (query.employeeId) filter.employeeId = query.employeeId;
    if (query.status) filter.status = query.status;
    const salaries = await this.salaryModel.find(filter).sort({ month: -1 }).lean();
    const total = salaries.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
    return { rows: salaries, total: salaries.length, totalAmount: total };
  }
}
