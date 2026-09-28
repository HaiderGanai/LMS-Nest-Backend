import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { MinPermission } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { SystemConfigService } from '../services/system-config.service';

@Controller()
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  // ── Branding ──────────────────────────────────────────────────────────────

  @Get('api/admin/system/branding')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  async getBranding() {
    return this.systemConfigService.getBranding();
  }

  @Put('api/admin/system/branding')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  async updateBranding(
    @Body() body: Record<string, unknown>,
    @Request() req: ExpressRequest,
  ) {
    const user = req.user as RequestUser;
    return this.systemConfigService.updateBranding(body, {
      uid: user.uid,
      email: user.email,
      name: user.name,
    });
  }

  // ── Role Designations (admin) ─────────────────────────────────────────────

  @Get('api/admin/system/role-designations')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  async getRoleDesignations() {
    return this.systemConfigService.getRoleDesignations();
  }

  @Put('api/admin/system/role-designations')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  async updateRoleDesignations(
    @Body() body: { designations: Array<{ role: string; displayName: string; description?: string }> },
    @Request() req: ExpressRequest,
  ) {
    const user = req.user as RequestUser;
    return this.systemConfigService.updateRoleDesignations(body.designations ?? [], user.uid);
  }

  // ── Role Designations (public) ────────────────────────────────────────────

  @Get('api/system/role-designations')
  async getPublicRoleDesignations() {
    return this.systemConfigService.getPublicRoleDesignations();
  }
}
