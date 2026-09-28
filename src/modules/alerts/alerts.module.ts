import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { AlertsController } from './controllers/alerts.controller';
import { MessageAlertsController } from './controllers/message-alerts.controller';
import { CallAlertModelName, CallAlertSchema } from './entities/call-alert.entity';
import { MessageAlertModelName, MessageAlertSchema } from './entities/message-alert.entity';
import { VideoAlertModelName, VideoAlertSchema } from './entities/video-alert.entity';
import { AlertsNotificationService } from './services/alerts-notification.service';
import { AnnouncementsService } from './services/announcements.service';
import { CallAlertsService } from './services/call-alerts.service';
import { MessageAlertsService } from './services/message-alerts.service';
import { VideoAlertsService } from './services/video-alerts.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SharedModule,
    SignalingModule,
    MongooseModule.forFeature([
      { name: CallAlertModelName, schema: CallAlertSchema },
      { name: VideoAlertModelName, schema: VideoAlertSchema },
      { name: MessageAlertModelName, schema: MessageAlertSchema },
    ]),
  ],
  controllers: [AlertsController, MessageAlertsController],
  providers: [
    CallAlertsService,
    VideoAlertsService,
    MessageAlertsService,
    AnnouncementsService,
    AlertsNotificationService,
  ],
  exports: [
    CallAlertsService,
    VideoAlertsService,
    MessageAlertsService,
    AnnouncementsService,
    AlertsNotificationService,
  ],
})
export class AlertsModule {}
