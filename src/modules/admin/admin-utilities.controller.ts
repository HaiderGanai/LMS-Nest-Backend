import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import type { Model } from 'mongoose';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../shared/guards/min-permission.guard';
import { MinPermission } from '../../shared/decorators/require-roles.decorator';
import { SignalingBroadcasterService } from '../signaling/services/signaling-broadcaster.service';

@Controller()
@UseGuards(JwtAuthGuard, MinPermissionGuard)
@MinPermission(100)
export class AdminUtilitiesController {
  constructor(
    @InjectModel('AppConfig') private readonly appConfigModel: Model<any>,
    @InjectModel('FamilyMember') private readonly familyMemberModel: Model<any>,
    @InjectModel('Family') private readonly familyModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('Student') private readonly studentModel: Model<any>,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  // POST /api/admin/counters/:name/next
  @Post('api/admin/counters/:name/next')
  async nextCounter(@Param('name') name: string) {
    const updated = await this.appConfigModel.findOneAndUpdate(
      { _id: `counter:${name}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    ).lean();
    const nextVal = (updated as any).seq || 1;
    return { success: true, nextVal };
  }

  // POST /api/admin/fix-student-uids
  @Post('api/admin/fix-student-uids')
  async fixStudentUids() {
    const studentsWithoutUid = await this.familyMemberModel
      .find({ role: 'student', uid: null })
      .lean();

    if (studentsWithoutUid.length === 0) {
      return { success: true, message: 'No students need fixing', fixed: 0, failed: 0 };
    }

    let fixed = 0;
    let failed = 0;
    const results: any[] = [];

    for (const student of studentsWithoutUid as any[]) {
      try {
        const family = await this.familyModel.findById(student.familyId).lean() as any;
        if (!family) {
          failed++;
          results.push({ studentId: student._id, name: student.name, status: 'failed', reason: 'Family not found' });
          continue;
        }

        const userId = crypto.randomBytes(16).toString('hex');

        await this.userModel.findOneAndUpdate(
          { _id: userId },
          {
            $set: {
              _id: userId,
              name: student.name || '',
              email: student.email || '',
              role: 'student',
              parentId: family.parentUid || null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        await this.studentModel.findOneAndUpdate(
          { _id: userId },
          {
            $set: {
              _id: userId,
              name: student.name || '',
              email: student.email || '',
              parentId: family.parentUid || null,
              studentStatus: student.status || 'active',
              assignedTeacher: student.assignedTeacher || null,
              teacherId: student.assignedTeacher || null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        await this.familyMemberModel.findByIdAndUpdate(student._id, { $set: { uid: userId } });

        fixed++;
        results.push({ studentId: student._id, name: student.name, status: 'fixed', uid: userId, parentId: family.parentUid });
      } catch (err: any) {
        failed++;
        results.push({ studentId: student._id, name: student.name, status: 'failed', reason: err.message });
      }
    }

    return {
      success: true,
      message: `Fixed ${fixed} students, ${failed} failed`,
      fixed,
      failed,
      results,
    };
  }

  // POST /api/admin/sync-users-to-students
  @Post('api/admin/sync-users-to-students')
  async syncUsersToStudents() {
    const studentUsers = await this.userModel.find({ role: 'student' }).lean();

    if (studentUsers.length === 0) {
      return { success: true, message: 'No student users found to sync', synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;
    const results: any[] = [];

    for (const user of studentUsers as any[]) {
      try {
        const existingStudent = await this.studentModel.findById(user._id).lean();
        if (existingStudent) {
          results.push({ userId: user._id, name: user.name, status: 'skipped', reason: 'already exists' });
          continue;
        }

        await this.studentModel.findOneAndUpdate(
          { _id: user._id },
          {
            $set: {
              _id: user._id,
              name: user.name || '',
              email: user.email || '',
              parentId: user.parentId || null,
              studentStatus: user.studentStatus || 'active',
              assignedTeacher: user.assignedTeacher || null,
              teacherId: user.assignedTeacher || null,
              isActive: user.isActive !== false,
              createdAt: user.createdAt || new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        synced++;
        results.push({ userId: user._id, name: user.name, status: 'synced', parentId: user.parentId });
      } catch (err: any) {
        failed++;
        results.push({ userId: user._id, name: user.name, status: 'failed', reason: err.message });
      }
    }

    return {
      success: true,
      message: `Synced ${synced} students, ${failed} failed`,
      synced,
      failed,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    };
  }

  // POST /api/admin/migrate-teacher-assignments
  @Post('api/admin/migrate-teacher-assignments')
  async migrateTeacherAssignments() {
    let totalParentsUpdated = 0;
    let totalStudentsUpdated = 0;
    const updateLog: any[] = [];

    const parents = await this.userModel.find({ role: 'parent' }).lean();
    for (const parent of parents as any[]) {
      const parentId = parent._id;
      const children = Array.isArray(parent.children) ? [...parent.children] : [];
      if (!children.length) continue;

      let updated = false;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const sid = String(child?.studentId || '').trim();
        if (!sid) continue;
        const studentDoc = await this.studentModel.findById(sid).lean() as any;
        const assignedTeacher = studentDoc?.assignedTeacher || studentDoc?.teacherId || null;
        if (child.assignedTeacher !== assignedTeacher) {
          updateLog.push({
            parentId,
            studentId: sid,
            studentName: child.name || studentDoc?.name || sid,
            oldTeacher: child.assignedTeacher || null,
            newTeacher: assignedTeacher,
          });
          children[i] = { ...child, assignedTeacher };
          totalStudentsUpdated++;
          updated = true;
        }
      }

      if (updated) {
        await this.userModel.updateOne({ _id: parentId }, { $set: { children, lastActivity: new Date() } });
        totalParentsUpdated++;
      }
    }

    return { success: true, totalParentsUpdated, totalStudentsUpdated, updateLog };
  }

  // POST /api/admin/migrate-students-collection
  @Post('api/admin/migrate-students-collection')
  async migrateStudentsCollection() {
    let totalStudentsCreated = 0;
    let totalStudentsUpdated = 0;
    const studentLog: any[] = [];

    const parents = await this.userModel.find({ role: 'parent' }).lean();
    for (const parent of parents as any[]) {
      const parentUid = parent._id;
      const children = Array.isArray(parent.children) ? parent.children : [];

      for (const child of children) {
        const studentId = String(child?.studentId || '').trim();
        if (!studentId) continue;

        const existing = await this.studentModel.findById(studentId).lean() as any;
        const studentDocData = {
          _id: studentId,
          studentId,
          name: child.name || studentId,
          email: child.email || '',
          parentId: parentUid,
          role: 'student',
          assignedTeacher: child.assignedTeacher || null,
          teacherId: child.assignedTeacher || null,
          studentStatus: child.studentStatus || 'active',
          isActive: child.isActive !== false,
          updatedAt: new Date(),
        };

        if (existing) {
          await this.studentModel.findByIdAndUpdate(studentId, { $set: studentDocData });
          totalStudentsUpdated++;
          studentLog.push({ studentId, name: child.name, action: 'updated', parentId: parentUid });
        } else {
          await this.studentModel.findOneAndUpdate(
            { _id: studentId },
            { $setOnInsert: { createdAt: new Date() }, $set: studentDocData },
            { upsert: true, new: true },
          );
          totalStudentsCreated++;
          studentLog.push({ studentId, name: child.name, action: 'created', parentId: parentUid });
        }
      }
    }

    return {
      success: true,
      message: `Created ${totalStudentsCreated}, updated ${totalStudentsUpdated} students`,
      totalStudentsCreated,
      totalStudentsUpdated,
      studentLog,
    };
  }

  // POST /api/admin/user-status
  @Post('api/admin/user-status')
  async updateUserStatus(@Body() body: { userId: string; isActive: boolean }) {
    const { userId, isActive } = body;
    if (!userId || typeof isActive !== 'boolean') {
      throw new BadRequestException('userId and isActive (boolean) are required');
    }
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { isActive, updatedAt: new Date() } },
    );
    // Real-time push to the affected user so client can react (logout/lockout)
    this.broadcaster.emitAccountStatusChanged(userId, { userId, isActive, timestamp: new Date().toISOString() });
    return { success: true };
  }

  // POST /api/admin/link-student-parents
  @Post('api/admin/link-student-parents')
  async linkStudentParents(
    @Body() body: {
      studentId: string;
      studentName?: string;
      parents: Array<{ parentId: string; relationship?: string }>;
    },
  ) {
    const { studentId, studentName, parents = [] } = body;
    if (!studentId) {
      throw new BadRequestException('studentId is required');
    }
    const studentDoc = await this.studentModel.findById(studentId).lean() as any;
    if (!studentDoc) {
      throw new NotFoundException('Student not found');
    }

    const priorParentIds = [studentDoc.parentId].filter(Boolean) as string[];
    const newParentIds = parents.map((p) => p.parentId).filter(Boolean) as string[];
    const primaryParentId = newParentIds[0] || null;

    await this.studentModel.updateOne(
      { _id: studentId },
      {
        $set: {
          parentId: primaryParentId,
          parentIds: newParentIds,
          parents,
          parentDetails: parents,
          updatedAt: new Date(),
        },
      },
    );

    const removedParentIds = priorParentIds.filter((id) => !newParentIds.includes(id));
    for (const parentId of removedParentIds) {
      const parentUser = await this.userModel.findById(parentId).lean() as any;
      if (!parentUser) continue;
      const updatedChildren = (Array.isArray(parentUser.children) ? parentUser.children : []).filter(
        (c: any) => String(c.studentId) !== String(studentId),
      );
      await this.userModel.updateOne({ _id: parentId }, { $set: { children: updatedChildren } });
    }

    for (const parent of parents) {
      const parentUser = await this.userModel.findById(parent.parentId).lean() as any;
      if (!parentUser) continue;
      const existingChildren: any[] = Array.isArray(parentUser.children) ? parentUser.children : [];
      const filteredChildren = existingChildren.filter(
        (c: any) => String(c.studentId) !== String(studentId),
      );
      filteredChildren.push({
        studentId,
        name: studentName || studentDoc.name,
        relationshipType: parent.relationship || 'guardian',
      });
      await this.userModel.updateOne({ _id: parent.parentId }, { $set: { children: filteredChildren } });
    }

    return { success: true };
  }
}
