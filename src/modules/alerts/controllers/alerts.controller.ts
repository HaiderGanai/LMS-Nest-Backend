import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MinPermission } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { CallAlertsService } from '../services/call-alerts.service';
import { VideoAlertsService } from '../services/video-alerts.service';
import { SignalingBroadcasterService } from '../../signaling/services/signaling-broadcaster.service';

@Controller()
export class AlertsController {
  constructor(
    private readonly callAlertsService: CallAlertsService,
    private readonly videoAlertsService: VideoAlertsService,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  // GET /api/alerts — MinPermission(90): list all alerts (call + video + message) merged
  @Get('/api/alerts')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getAlerts(@Query() query: Record<string, string>) {
    return this.callAlertsService.listAlerts(query);
  }

  // DELETE /api/alerts — MinPermission(100): delete all alerts from all collections
  @Delete('/api/alerts')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  async deleteAllAlerts() {
    return this.callAlertsService.deleteAllAlerts();
  }

  // PUT /api/alerts/:id — MinPermission(90): update alert (searches call, video, message)
  @Put('/api/alerts/:id')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async updateAlert(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.callAlertsService.updateAlert(id, body);
  }

  // DELETE /api/alerts/:id — MinPermission(90): delete alert (searches call, video, message)
  @Delete('/api/alerts/:id')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async deleteAlert(@Param('id') id: string) {
    return this.callAlertsService.deleteAlert(id);
  }

  // POST /api/safety-alert -> call_alerts collection (no auth)
  // POST /api/video-alert  -> video_alerts collection (no auth)
  @Post(['/api/safety-alert', '/api/video-alert'])
  @HttpCode(200)
  async createSafetyOrVideoAlert(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    const isVideoAlert = req.path === '/api/video-alert';
    const result = await this.videoAlertsService.createVideoAlert(body, isVideoAlert);
    // Broadcast socket event so teacher app + admin LMS get real-time alerts
    const teacherId = String((body as any)?.teacherId || '');
    const eventName = isVideoAlert ? 'video-alert' : 'safety-alert';
    if (teacherId) this.broadcaster.emitToUser(teacherId, eventName, body);
    this.broadcaster.emitToAdmins(eventName, body);
    this.broadcaster.emitToAdmins('ai-alert', body);
    return result;
  }

  // POST /api/safety-alerts — pattern detection alert from teacher desktop (no auth)
  @Post('/api/safety-alerts')
  @HttpCode(201)
  async createPatternDetectionAlert(@Body() body: Record<string, unknown>) {
    const result = await this.callAlertsService.createCallAlert(body);
    const teacherId = String((body as any)?.teacherId || '');
    if (teacherId) this.broadcaster.emitToUser(teacherId, 'safety-alert', body);
    this.broadcaster.emitToAdmins('safety-alert', body);
    this.broadcaster.emitToAdmins('ai-alert', body);
    return result;
  }
}
