import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecordingProcessingService } from '../services/recording-processing.service';

@Injectable()
export class RecordingProcessorJob {
  constructor(private readonly recordingProcessingService: RecordingProcessingService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async processPendingRecordings(): Promise<void> {
    await this.recordingProcessingService.processPendingRecordings();
  }
}
