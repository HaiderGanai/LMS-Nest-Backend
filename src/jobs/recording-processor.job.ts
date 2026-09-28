import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RecordingProcessorJob {
  private readonly logger = new Logger(RecordingProcessorJob.name);

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processPendingRecordings(): Promise<void> {
    // 1. Placeholder scheduler hook for recording conversion queue
    // 2. Actual processing logic is exposed in RecordingsModule services and will be moved here incrementally
    this.logger.debug('Recording processing cycle triggered');
  }
}
