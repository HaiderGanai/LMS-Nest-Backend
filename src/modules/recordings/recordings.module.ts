import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { RecordingsController } from './controllers/recordings.controller';
import { StorageController } from './controllers/storage.controller';
import { CallRecordingModelName, CallRecordingSchema } from './entities/call-recording.entity';
import { FlaggedTranscriptModelName, FlaggedTranscriptSchema } from './entities/flagged-transcript.entity';
import { ProcessingQueueModelName, ProcessingQueueSchema } from './entities/processing-queue.entity';
import { RecordingProcessorJob } from './jobs/recording-processor.job';
import { RecordingsRepository } from './repositories/recordings.repository';
import { RecordingProcessingService } from './services/recording-processing.service';
import { RecordingsService } from './services/recordings.service';
import { StorageService } from './services/storage.service';
import { TranscriptService } from './services/transcript.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SharedModule,
    SignalingModule,
    MongooseModule.forFeature([
      { name: CallRecordingModelName, schema: CallRecordingSchema },
      { name: ProcessingQueueModelName, schema: ProcessingQueueSchema },
      { name: FlaggedTranscriptModelName, schema: FlaggedTranscriptSchema },
    ]),
  ],
  controllers: [RecordingsController, StorageController],
  providers: [
    RecordingsService,
    RecordingProcessingService,
    StorageService,
    TranscriptService,
    RecordingsRepository,
    RecordingProcessorJob,
  ],
  exports: [RecordingsService, RecordingProcessingService, StorageService, TranscriptService],
})
export class RecordingsModule {}
