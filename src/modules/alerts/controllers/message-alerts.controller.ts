import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { MinPermission } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { MessageAlertsService } from '../services/message-alerts.service';

@Controller()
export class MessageAlertsController {
  constructor(private readonly messageAlertsService: MessageAlertsService) {}

  // GET /api/message-alerts — MinPermission(90)
  @Get('/api/message-alerts')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getMessageAlerts(
    @Query() query: Record<string, string>,
  ) {
    return this.messageAlertsService.getMessageAlerts(query);
  }

  // PUT /api/message-alerts/:id — MinPermission(90)
  @Put('/api/message-alerts/:id')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async updateMessageAlert(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.messageAlertsService.updateMessageAlert(id, body);
  }
}
