import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { CallsController } from './controllers/calls.controller';
import { CallLogModelName, CallLogSchema } from './entities/call-log.entity';
import { CallsCallRecordingModelName, CallsCallRecordingSchema } from './entities/call-recording.entity';
import { CallSessionModelName, CallSessionSchema } from './entities/call-session.entity';
import { CallModelName, CallSchema } from './entities/call.entity';
import { CallsGateway } from './gateways/calls.gateway';
import { CallsRepository } from './repositories/calls.repository';
import { CallLogsService } from './services/call-logs.service';
import { CallsService } from './services/calls.service';
import { CallStateService } from './services/call-state.service';
import { JanusService } from './services/janus.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: CallModelName, schema: CallSchema },
      { name: CallSessionModelName, schema: CallSessionSchema },
      { name: CallLogModelName, schema: CallLogSchema },
      { name: CallsCallRecordingModelName, schema: CallsCallRecordingSchema },
      { name: 'CallTelemetryEvent', schema: getLegacyModelSchema('CallTelemetryEvent') },
    ]),
  ],
  controllers: [CallsController],
  providers: [
    CallsService,
    CallStateService,
    JanusService,
    CallLogsService,
    CallsRepository,
    CallsGateway,
  ],
  exports: [CallsService, CallStateService, JanusService, CallsGateway, CallLogsService],
})
export class CallsModule {}
