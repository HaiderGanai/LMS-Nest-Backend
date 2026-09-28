import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ReportsService } from '../services/reports.service';

@Controller('/api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('/family-filter')
  @RequireRoles('admin', 'manager')
  async familyFilter(@Query() query: any) {
    return this.reportsService.familyFilter(query);
  }

  @Get('/student-teacher')
  @RequireRoles('admin', 'manager')
  async studentTeacher(@Query() query: any) {
    return this.reportsService.studentTeacher(query);
  }

  @Get('/class-salary')
  @RequireRoles('admin', 'manager')
  async classSalary(@Query() query: any) {
    return this.reportsService.classSalary(query);
  }
}
