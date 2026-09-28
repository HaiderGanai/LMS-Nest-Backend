import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { TelemetryController } from './controllers/telemetry.controller';
import { CallTelemetryEventModelName, CallTelemetryEventSchema } from './entities/call-telemetry-event.entity';
import { AnalyticsService } from './services/analytics.service';
import { MetricsService } from './services/metrics.service';
import { TelemetryService } from './services/telemetry.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: CallTelemetryEventModelName, schema: CallTelemetryEventSchema },
      { name: 'User', schema: getLegacyModelSchema('User') },
      { name: 'Message', schema: getLegacyModelSchema('Message') },
      { name: 'Call', schema: getLegacyModelSchema('Call') },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, AnalyticsService, MetricsService],
  exports: [TelemetryService, AnalyticsService, MetricsService],
})
export class TelemetryModule {}
