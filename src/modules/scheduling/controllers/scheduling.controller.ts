import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { SchedulingService } from '../services/scheduling.service';

@Controller('api/scheduling')
@UseGuards(JwtAuthGuard, RolesGuard, AdminDeptGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // ── Availability ──────────────────────────────────────────────────────────

  @Get('teachers/:teacherId/availability')
  @RequireAdminDept(90)
  async listTeacherAvailability(
    @Param('teacherId') teacherId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.schedulingService.listTeacherAvailability(teacherId, dateFrom, dateTo);
  }

  @Get('me/availability')
  @RequireRoles('teacher', 'admin')
  async listMyAvailability(
    @Req() req: Request,
    @Query('teacherId') queryTeacherId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const user = req.user as RequestUser;
    const teacherId = user.role === 'teacher'
      ? user.uid
      : String(queryTeacherId || '').trim();

    if (!teacherId) {
      throw new BadRequestException('teacherId is required for admin access');
    }

    return this.schedulingService.listTeacherAvailability(teacherId, dateFrom, dateTo);
  }

  @Put('teachers/:teacherId/availability/:date')
  @RequireAdminDept(90)
  async upsertTeacherAvailability(
    @Param('teacherId') teacherId: string,
    @Param('date') date: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.schedulingService.upsertTeacherAvailability(teacherId, date, body);
  }

  @Delete('teachers/:teacherId/availability/:date/breaks/:breakId')
  @RequireAdminDept(90)
  async deleteTeacherAvailabilityBreak(
    @Param('teacherId') teacherId: string,
    @Param('date') date: string,
    @Param('breakId') breakId: string,
  ) {
    return this.schedulingService.deleteTeacherAvailabilityBreak(teacherId, date, breakId);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  @Post('search')
  @RequireAdminDept(90)
  async searchAvailableTeachers(@Body() body: Record<string, unknown>) {
    return this.schedulingService.searchAvailableTeachers(body);
  }

  // ── Assign / Unassign ────────────────────────────────────────────────────

  @Post('assign')
  @RequireAdminDept(90)
  async assignTeacherSchedule(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.schedulingService.assignTeacherSchedule({
      teacherId: body?.teacherId,
      familyId: body?.familyId,
      familyMemberId: body?.familyMemberId,
      studentDate: body?.studentDate,
      studentTime: body?.studentTime,
      studentEndTime: body?.studentEndTime,
      studentTimezone: body?.studentTimezone,
      durationMinutes: Number(body?.durationMinutes || 0),
      requiredDays: body?.requiredDays,
      studentNeeds: body?.studentNeeds || '',
      adminNote: body?.adminNote || '',
      assignedBy: user?.uid || 'admin',
      bookingSource: body?.bookingSource || 'admin_assign',
      replaceExistingTeacher: body?.replaceExistingTeacher === true,
    });
  }

  @Post('unassign')
  @RequireAdminDept(90)
  async unassignTeacherSchedule(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.schedulingService.unassignTeacherSchedule({
      familyId: body?.familyId,
      familyMemberId: body?.familyMemberId,
      adminNote: body?.adminNote || '',
      unassignedBy: user?.uid || 'admin',
    });
  }

  // ── Shift ─────────────────────────────────────────────────────────────────

  @Get('teachers/:teacherId/shift-options')
  @RequireAdminDept(90)
  async getShiftCandidates(@Param('teacherId') teacherId: string) {
    return this.schedulingService.getShiftCandidates(teacherId);
  }

  @Post('teachers/:teacherId/shift')
  @RequireAdminDept(90)
  async shiftTeacherSchedule(
    @Req() req: Request,
    @Param('teacherId') teacherId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.schedulingService.shiftTeacherSchedule(teacherId, {
      targetTeacherId: body?.targetTeacherId as string,
      reason: (body?.reason as string) || '',
      shiftedBy: user?.uid || user?.email || 'admin',
    });
  }
}
