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
export class BookingsController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('bookings')
  @RequireAdminDept(90)
  async listBookings(
    @Query('teacherId') teacherId?: string,
    @Query('familyId') familyId?: string,
    @Query('familyMemberId') familyMemberId?: string,
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('businessDate') businessDate?: string,
  ) {
    return this.schedulingService.listBookings({
      teacherId,
      familyId,
      familyMemberId,
      studentId,
      status,
      dateFrom,
      dateTo,
      businessDate,
    });
  }

  @Get('me/bookings')
  @RequireRoles('teacher', 'admin')
  async listMyBookings(
    @Req() req: Request,
    @Query('teacherId') queryTeacherId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('businessDate') businessDate?: string,
  ) {
    const user = req.user as RequestUser;
    const teacherId = user.role === 'teacher'
      ? user.uid
      : String(queryTeacherId || '').trim();

    if (!teacherId) {
      throw new BadRequestException('teacherId is required for admin access');
    }

    return this.schedulingService.listBookings({
      teacherId,
      status,
      dateFrom,
      dateTo,
      businessDate,
    });
  }

  @Post('bookings')
  @RequireAdminDept(90)
  async createBooking(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as RequestUser;
    return this.schedulingService.createBooking({
      teacherId: body?.teacherId as string,
      familyId: body?.familyId as string,
      familyMemberId: body?.familyMemberId as string,
      studentDate: body?.studentDate as string,
      studentTime: body?.studentTime as string,
      studentEndTime: body?.studentEndTime as string,
      studentTimezone: body?.studentTimezone as string,
      teacherDate: body?.teacherDate as string,
      teacherTime: body?.teacherTime as string,
      durationMinutes: Number(body?.durationMinutes || 30),
      adminNote: (body?.adminNote as string) || '',
      assignedBy: user?.uid || 'admin',
      bookingSource: (body?.bookingSource as string) || 'admin_search',
    });
  }

  @Put('bookings/:id')
  @RequireAdminDept(90)
  async updateBooking(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.schedulingService.updateBooking(id, body);
  }

  @Delete('bookings/:id')
  @RequireAdminDept(90)
  async deleteBooking(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.schedulingService.deleteBooking(id, {
      status: 'cancelled',
      adminNote: (body?.adminNote as string) || '',
    });
  }
}
