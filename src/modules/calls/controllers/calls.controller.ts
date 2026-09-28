import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MinPermission } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { CallLogsService } from '../services/call-logs.service';
import { CallsService } from '../services/calls.service';

@Controller()
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly callLogsService: CallLogsService,
  ) {}

  // POST /api/call-telemetry — no auth (called by clients)
  // Handled in TelemetryModule — kept here for documentation only.

  // POST /api/calls/force-end — no auth (called by teacher client)
  @Post('/api/calls/force-end')
  @HttpCode(200)
  async forceEndCall(@Body() body: Record<string, unknown>) {
    return this.callsService.forceEndCall(body);
  }

  // GET /api/calls — MinPermission(90)
  @Get('/api/calls')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getCalls(@Query() query: Record<string, string>) {
    return this.callsService.getCalls(query);
  }

  // GET /api/calls/:callId — MinPermission(90)
  @Get('/api/calls/:callId')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getCallById(@Param('callId') callId: string) {
    return this.callsService.getCallById(callId);
  }

  // GET /api/calls/:callId/telemetry — MinPermission(90)
  @Get('/api/calls/:callId/telemetry')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getCallTelemetry(
    @Param('callId') callId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.callsService.getCallTelemetry(callId, query);
  }

  // PUT /api/calls/:callId — MinPermission(90)
  @Put('/api/calls/:callId')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async updateCall(
    @Param('callId') callId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.callsService.updateCall(callId, body);
  }

  // POST /api/call-logs/start — no auth (called by teacher client)
  @Post('/api/call-logs/start')
  @HttpCode(200)
  async startCallLog(@Body() body: Record<string, unknown>) {
    return this.callLogsService.startCallLog(body);
  }

  // POST /api/call-logs/end — no auth (called by teacher client)
  @Post('/api/call-logs/end')
  @HttpCode(200)
  async endCallLog(@Body() body: Record<string, unknown>) {
    return this.callLogsService.endCallLog(body);
  }

  // GET /api/admin/active-calls — MinPermission(90)
  @Get('/api/admin/active-calls')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getActiveCalls() {
    return this.callsService.getActiveCalls();
  }

  // GET /api/active-calls/:studentId and /calls/active/:studentId — no auth (parent/student app polls)
  @Get(['/api/active-calls/:studentId', '/calls/active/:studentId'])
  async getActiveCallsForStudent(@Param('studentId') studentId: string) {
    const { activeCalls } = this.callsService.getActiveCalls() as any;
    const activeStatuses = ['pending', 'ringing', 'active', 'connected', 'reconnecting'];
    const studentCalls = (activeCalls as any[])
      .filter((call: any) => call.studentId === studentId && activeStatuses.includes(call.status))
      .sort((a: any, b: any) => {
        const priority = (status: string) => {
          if (status === 'pending' || status === 'ringing') return 3;
          if (status === 'reconnecting') return 2;
          return 1;
        };
        return priority(b.status) - priority(a.status);
      });

    if (studentCalls.length === 0) {
      return { hasActiveCall: false, call: null };
    }

    const call = studentCalls[0];
    const status: string = call.status;
    const teacherReadyStatuses = ['active', 'connected', 'reconnecting'];
    return {
      hasActiveCall: true,
      call: {
        callId: call.callId,
        teacherId: call.teacherId,
        status,
        roomId: call.roomId,
        teacherReady: teacherReadyStatuses.includes(status),
        type: status === 'pending' || status === 'ringing' ? 'call_invite' : 'meeting_active',
      },
    };
  }
}
