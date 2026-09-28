import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminDeptGuard } from '../../../shared/guards/admin-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RequireAdminDept } from '../../../shared/decorators/require-roles.decorator';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';
import { ClassHoursService } from '../services/class-hours.service';

@Controller('api/class-hours')
@UseGuards(JwtAuthGuard)
export class ClassHoursController {
  constructor(private readonly classHoursService: ClassHoursService) {}

  // 13. GET /api/class-hours — RequireAdminDept(70) + FamilyScope
  @Get()
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(70)
  async getClassHours(
    @Query() query: Record<string, unknown>,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.classHoursService.getClassHours(query, req);
  }

  // 14. POST /api/class-hours — RequireAdminDept(80)
  @Post()
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async createClassHours(@Body() body: Record<string, unknown>) {
    return this.classHoursService.createClassHours(body);
  }

  // 15. PUT /api/class-hours/:id — RequireAdminDept(80), recalculate remainingHours
  @Put(':id')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async updateClassHours(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.classHoursService.updateClassHours(id, body);
  }
}
