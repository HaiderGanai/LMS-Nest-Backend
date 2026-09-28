import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoBillingJob } from './auto-billing.job';
import { RecordingProcessorJob } from './recording-processor.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AutoBillingJob, RecordingProcessorJob],
  exports: [AutoBillingJob, RecordingProcessorJob],
})
export class JobsModule {}
