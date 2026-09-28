import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RecordingProcessingService } from '../services/recording-processing.service';
import { RecordingsService } from '../services/recordings.service';
import { TranscriptService } from '../services/transcript.service';
import { SignalingBroadcasterService } from '../../signaling/services/signaling-broadcaster.service';

@Controller()
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly recordingProcessingService: RecordingProcessingService,
    private readonly transcriptService: TranscriptService,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  // GET /api/recordings — no auth
  @Get('/api/recordings')
  async getRecordings(@Query('limit') limit?: string) {
    return this.recordingsService.getRecordings(parseInt(limit || '') || 50);
  }

  // GET /api/recordings/:callId — no auth
  @Get('/api/recordings/:callId')
  async getRecordingById(@Param('callId') callId: string) {
    return this.recordingsService.getRecordingById(callId);
  }

  // POST /api/recordings/:callId/process — no auth
  @Post('/api/recordings/:callId/process')
  @HttpCode(HttpStatus.ACCEPTED)
  async processRecording(
    @Param('callId') callId: string,
    @Body() body: Record<string, unknown>,
    @Query('mode') modeQuery?: string,
  ) {
    const mode = String((body?.mode ?? modeQuery) || 'combined');
    return this.recordingProcessingService.processRecording(callId, mode);
  }

  // GET /api/recordings/:callId/process-status — no auth
  @Get('/api/recordings/:callId/process-status')
  async getProcessingStatus(@Param('callId') callId: string) {
    return this.recordingProcessingService.getProcessingStatus(callId);
  }

  // DELETE /api/recordings/:callId — no auth
  @Delete('/api/recordings/:callId')
  async deleteRecording(@Param('callId') callId: string) {
    return this.recordingProcessingService.deleteRecording(callId);
  }

  // POST /api/recordings/batch-delete — no auth
  @Post('/api/recordings/batch-delete')
  @HttpCode(HttpStatus.OK)
  async deleteRecordingsBatch(@Body() body: { callIds?: string[] }) {
    return this.recordingProcessingService.batchDeleteRecordings(body?.callIds || []);
  }

  // POST /api/flagged-transcript — no auth
  @Post('/api/flagged-transcript')
  @HttpCode(HttpStatus.OK)
  async createFlaggedTranscript(@Body() body: Record<string, unknown>) {
    const result = await this.transcriptService.createFlaggedTranscript(body);
    // Broadcast to admin LMS in realtime
    this.broadcaster.emitToAdmins('flagged-transcript-alert', body);
    this.broadcaster.emitToAdmins('ai-alert', body);
    const teacherId = String((body as any)?.teacherId || '');
    if (teacherId) this.broadcaster.emitToUser(teacherId, 'safety-alert', body);
    return result;
  }

  // POST /api/stt/ingest — no auth (called by STT service)
  @Post('/api/stt/ingest')
  @HttpCode(HttpStatus.OK)
  async sttIngest(@Body() body: Record<string, unknown>) {
    const result = await this.transcriptService.sttIngest(body);
    // Forward live transcript to teacher app
    const teacherId = String((body as any)?.teacherId || '');
    if (teacherId) this.broadcaster.emitSttTranscript(teacherId, body);
    return result;
  }
}
