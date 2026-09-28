import {
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
import { RequireAdminDept, MinPermission, RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { AdminDeptGuard } from '../../../shared/guards/admin-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { CreateDailyClassDto } from '../dto/create-daily-class.dto';
import { RescheduleDailyClassDto } from '../dto/reschedule-daily-class.dto';
import { UpdateDailyClassStatusDto } from '../dto/update-daily-class-status.dto';
import { DailyClassesService } from '../services/daily-classes.service';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class DailyClassesController {
  constructor(private readonly dailyClassesService: DailyClassesService) {}

  // -----------------------------------------------------------------------
  // GET /api/daily-classes — list with filters
  // -----------------------------------------------------------------------
  @Get('daily-classes')
  @UseGuards(RolesGuard)
  @RequireRoles('admin', 'teacher', 'manager')
  async listClasses(
    @Query() query: Record<string, string | undefined>,
    @Req() req: Request,
  ) {
    const user = req.user as RequestUser;
    return this.dailyClassesService.listClasses(query, user);
  }

  // -----------------------------------------------------------------------
  // POST /api/daily-classes/generate — auto-generate from ScheduleBookings
  // -----------------------------------------------------------------------
  @Post('daily-classes/generate')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async generateClasses(
    @Body() body: { date: string; businessTimezone?: string },
  ) {
    return this.dailyClassesService.generateClasses(body.date, body.businessTimezone);
  }

  // -----------------------------------------------------------------------
  // POST /api/daily-classes — create manual/temporary class
  // -----------------------------------------------------------------------
  @Post('daily-classes')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async createClass(@Body() body: CreateDailyClassDto) {
    return this.dailyClassesService.createClass(body);
  }

  // -----------------------------------------------------------------------
  // PUT /api/daily-classes/:id — general update
  // -----------------------------------------------------------------------
  @Put('daily-classes/:id')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async updateClass(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dailyClassesService.updateClass(id, body);
  }

  // -----------------------------------------------------------------------
  // PUT /api/daily-classes/:id/status — status transition
  // -----------------------------------------------------------------------
  @Put('daily-classes/:id/status')
  @UseGuards(RolesGuard)
  @RequireRoles('admin', 'teacher', 'manager')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDailyClassStatusDto,
    @Req() req: Request,
  ) {
    const user = req.user as RequestUser;
    return this.dailyClassesService.updateStatus(id, body.status, user);
  }

  // -----------------------------------------------------------------------
  // GET /api/my-active-class — student/parent polling
  // -----------------------------------------------------------------------
  @Get('my-active-class')
  @UseGuards(RolesGuard)
  @RequireRoles('admin', 'teacher', 'manager', 'parent', 'student')
  async getMyActiveClass(@Req() req: Request) {
    const user = req.user as RequestUser;
    return this.dailyClassesService.getMyActiveClass(user);
  }

  // -----------------------------------------------------------------------
  // POST /api/daily-classes/:id/reschedule — reschedule to new date/time
  // -----------------------------------------------------------------------
  @Post('daily-classes/:id/reschedule')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async rescheduleClass(
    @Param('id') id: string,
    @Body() body: RescheduleDailyClassDto,
  ) {
    return this.dailyClassesService.rescheduleClass(id, body);
  }

  // -----------------------------------------------------------------------
  // POST /api/test/create-now-class — test utility
  // -----------------------------------------------------------------------
  @Post('test/create-now-class')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async createNowClass(
    @Body()
    body: {
      teacherId: string;
      teacherUid?: string;
      teacherName?: string;
      studentId: string;
      studentName?: string;
      familyId?: string;
      teacherTimezone?: string;
      studentTimezone?: string;
      durationMinutes?: number;
    },
  ) {
    return this.dailyClassesService.createNowClass(body);
  }

  // -----------------------------------------------------------------------
  // DELETE /api/test/cleanup-test-classes — test utility
  // -----------------------------------------------------------------------
  @Delete('test/cleanup-test-classes')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async cleanupTestClasses(@Query('teacherId') teacherId?: string) {
    return this.dailyClassesService.cleanupTestClasses(teacherId);
  }
}
