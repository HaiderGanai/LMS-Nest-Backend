import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  MinPermission,
  RequireHRDept,
} from '../../../shared/decorators/require-roles.decorator';
import { HRDeptGuard } from '../../../shared/guards/hr-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { EmployeesService } from '../services/employees.service';

@Controller('api/admin/employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // ── 1. GET /api/admin/employees ─────────────────────────────────────────
  @Get()
  @UseGuards(HRDeptGuard)
  @RequireHRDept(50)
  async listEmployees(@Query('designation') designation?: string) {
    return this.employeesService.getEmployees({ designation });
  }

  // ── 2. GET /api/admin/employees/stats ────────────────────────────────────
  @Get('stats')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async getEmployeeStats() {
    return this.employeesService.getEmployeeStats();
  }

  // ── 3. GET /api/admin/employees/:id ──────────────────────────────────────
  @Get(':id')
  @UseGuards(HRDeptGuard)
  @RequireHRDept(50)
  async getEmployeeById(@Param('id') id: string) {
    return this.employeesService.getEmployeeById(id);
  }

  // ── 4. POST /api/admin/employees/:id/agreement ───────────────────────────
  @Post(':id/agreement')
  @UseGuards(HRDeptGuard)
  @RequireHRDept(50)
  async updateAgreement(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.employeesService.updateAgreement(id, body);
  }

  // ── 5. POST /api/admin/employees ─────────────────────────────────────────
  @Post()
  @UseGuards(HRDeptGuard)
  @RequireHRDept(60)
  async createEmployee(@Body() body: Record<string, unknown>) {
    return this.employeesService.createEmployee(body);
  }

  // ── 6. PUT /api/admin/employees/:id ──────────────────────────────────────
  @Put(':id')
  @UseGuards(HRDeptGuard)
  @RequireHRDept(60)
  async updateEmployee(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.employeesService.updateEmployee(id, body);
  }

  // ── 7. PUT /api/admin/employees/:id/status ───────────────────────────────
  @Put(':id/status')
  @UseGuards(HRDeptGuard)
  @RequireHRDept(60)
  async updateEmployeeStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
    @Req() req: Request,
  ) {
    const actorUid = (req.user as RequestUser | undefined)?.uid;
    return this.employeesService.updateEmployeeStatus(id, body, actorUid);
  }

  // ── 8. POST /api/admin/employees/:id/enable-login ────────────────────────
  @Post(':id/enable-login')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  @HttpCode(HttpStatus.OK)
  async enableLogin(@Param('id') id: string) {
    return this.employeesService.enableLogin(id);
  }

  // ── 9. POST /api/admin/employees/:id/reset-password ──────────────────────
  @Post(':id/reset-password')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    return this.employeesService.resetPassword(id, body);
  }

  // ── 10. DELETE /api/admin/employees/:id ──────────────────────────────────
  @Delete(':id')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async deleteEmployee(@Param('id') id: string) {
    return this.employeesService.deleteEmployee(id);
  }
}
