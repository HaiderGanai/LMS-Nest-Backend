import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { TelemetryEventDto } from '../dto/telemetry-event.dto';
import { AnalyticsService } from '../services/analytics.service';
import { MetricsService } from '../services/metrics.service';
import { TelemetryService } from '../services/telemetry.service';

@Controller()
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly analyticsService: AnalyticsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('/api/call-telemetry')
  async createTelemetryEvent(@Body() body: TelemetryEventDto) {
    return this.telemetryService.createTelemetryEvent(body);
  }

  // POST /api/stt/status — STT worker heartbeat/status report (no auth, called by worker)
  @Post('/api/stt/status')
  async sttStatus(@Body() body: any) {
    return {
      success: true,
      received: true,
      timestamp: new Date().toISOString(),
      ...(body?.workerId ? { workerId: body.workerId } : {}),
    };
  }

  @Get('/api/stats/users/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('admin')
  async getUsersOverview() {
    return this.analyticsService.getUsersOverview();
  }

  @Get('/api/stats/messages/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('admin')
  async getMessagesOverview() {
    return this.analyticsService.getMessagesOverview();
  }

  @Get('/api/stats/calls/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('admin')
  async getCallsOverview() {
    return this.analyticsService.getCallsOverview();
  }

  @Get('/api/stats/system/health')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('admin')
  async getSystemHealthMetrics() {
    return this.metricsService.getSystemHealthMetrics();
  }
}
