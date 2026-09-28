import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAdminDept, RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { AdminDeptGuard } from '../../../shared/guards/admin-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { ScheduleAssignmentService } from '../services/schedule-assignment.service';

@Controller('api/scheduling')
@UseGuards(JwtAuthGuard, RolesGuard, AdminDeptGuard)
export class AssignmentRequestsController {
  constructor(private readonly scheduleAssignmentService: ScheduleAssignmentService) {}

  @Post('assignment-requests')
  @RequireAdminDept(90)
  async createAssignmentRequests(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.scheduleAssignmentService.createAssignmentRequests({
      teacherIds: body?.teacherIds,
      familyId: body?.familyId,
      familyMemberId: body?.familyMemberId,
      studentDate: body?.studentDate,
      studentTime: body?.studentTime,
      studentEndTime: body?.studentEndTime,
      studentTimezone: body?.studentTimezone,
      durationMinutes: Number(body?.durationMinutes || 0),
      requiredDays: body?.requiredDays,
      studentNeeds: body?.studentNeeds || '',
      requestNote: body?.requestNote || '',
      requestedBy: user?.uid || 'admin',
      requestedByName: user?.name || user?.uid || 'Admin',
    } as never);
  }

  @Get('assignment-requests')
  @RequireAdminDept(90)
  async listAssignmentRequests(
    @Req() req: Request,
    @Query('familyId') familyId?: string,
    @Query('familyMemberId') familyMemberId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('studentDate') studentDate?: string,
    @Query('studentTime') studentTime?: string,
    @Query('durationMinutes') durationMinutes?: string,
    @Query('requiredDays') requiredDays?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as RequestUser;
    const statuses = String(status || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);

    return this.scheduleAssignmentService.listAssignmentRequests({
      actorRole: 'admin',
      actorId: user?.uid || 'admin',
      familyId,
      familyMemberId,
      teacherId,
      batchId,
      statuses,
      studentDate,
      studentTime,
      durationMinutes: Number(durationMinutes || 0),
      requiredDays: String(requiredDays || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      limit: Number(limit || 100),
    });
  }

  @Get('me/assignment-requests')
  @RequireRoles('teacher', 'admin')
  async listMyAssignmentRequests(
    @Req() req: Request,
    @Query('teacherId') queryTeacherId?: string,
    @Query('familyId') familyId?: string,
    @Query('familyMemberId') familyMemberId?: string,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('studentDate') studentDate?: string,
    @Query('studentTime') studentTime?: string,
    @Query('durationMinutes') durationMinutes?: string,
    @Query('requiredDays') requiredDays?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as RequestUser;
    const actorRole = user.role === 'teacher' ? 'teacher' : 'admin';
    const actorId = user.role === 'teacher'
      ? user.uid
      : String(queryTeacherId || '').trim();

    if (!actorId) {
      throw new BadRequestException('teacherId is required for admin access');
    }

    const statuses = String(status || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);

    return this.scheduleAssignmentService.listAssignmentRequests({
      actorRole,
      actorId,
      familyId,
      familyMemberId,
      batchId,
      statuses,
      studentDate,
      studentTime,
      durationMinutes: Number(durationMinutes || 0),
      requiredDays: String(requiredDays || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      limit: Number(limit || 100),
    });
  }

  @Post('assignment-requests/:id/respond')
  @RequireRoles('teacher')
  async respondToAssignmentRequest(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.scheduleAssignmentService.respondToAssignmentRequest(id, {
      requestId: id,
      teacherId: user?.uid,
      action: body?.action,
      note: (body?.note as string) || '',
    });
  }

  @Post('assignment-requests/:id/finalize')
  @RequireAdminDept(90)
  async finalizeAssignmentRequest(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const user = req.user as RequestUser;
    return this.scheduleAssignmentService.finalizeAssignmentRequest(id, {
      requestId: id,
      finalizedBy: user?.uid || 'admin',
    });
  }
}
