import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ActionLogsService } from '../services/action-logs.service';

@Controller('/api/action-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionLogsController {
  constructor(private readonly actionLogsService: ActionLogsService) {}

  @Get('/')
  @RequireRoles('admin', 'manager')
  async list(@Query() query: any) {
    return this.actionLogsService.list(query);
  }

  @Get('/stats')
  @RequireRoles('admin', 'manager')
  async stats() {
    return this.actionLogsService.stats();
  }
}
