import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ParentService } from '../services/parent.service';

@Controller('/api/parent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  @Get('/:parentId/alerts')
  @RequireRoles('parent', 'admin')
  async getAlerts(@Param('parentId') parentId: string) {
    return this.parentService.getAlerts(parentId);
  }

  @Get('/:parentId/today-classes')
  @RequireRoles('parent', 'admin')
  async getTodayClasses(@Param('parentId') parentId: string) {
    return this.parentService.getTodayClasses(parentId);
  }

  @Get('/:parentId/students/:studentId/schedule')
  @RequireRoles('parent', 'admin')
  async getStudentSchedule(
    @Param('parentId') parentId: string,
    @Param('studentId') studentId: string,
    @Query() query: any,
  ) {
    return this.parentService.getStudentSchedule(parentId, studentId, query);
  }

  @Post('/:parentId/today-classes/:classId/leave')
  @RequireRoles('parent', 'admin')
  async leaveClass(
    @Param('parentId') parentId: string,
    @Param('classId') classId: string,
    @Body() body: { reason?: string },
  ) {
    return this.parentService.leaveClass(parentId, classId, body?.reason);
  }
}
