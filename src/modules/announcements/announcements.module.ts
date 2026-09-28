import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { AnnouncementsController } from './controllers/announcements.controller';
import { AnnouncementModelName, AnnouncementSchema } from './entities/announcement.entity';
import { AnnouncementsService } from './services/announcements.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SharedModule,
    SignalingModule,
    MongooseModule.forFeature([{ name: AnnouncementModelName, schema: AnnouncementSchema }]),
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
