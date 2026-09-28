import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { AdminUtilitiesController } from './admin-utilities.controller';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SignalingModule,
    MongooseModule.forFeature([
      { name: 'AppConfig', schema: getLegacyModelSchema('AppConfig') },
      { name: 'FamilyMember', schema: getLegacyModelSchema('FamilyMember') },
      { name: 'Family', schema: getLegacyModelSchema('Family') },
      { name: 'User', schema: getLegacyModelSchema('User') },
      { name: 'Student', schema: getLegacyModelSchema('Student') },
    ]),
  ],
  controllers: [AdminUtilitiesController],
})
export class AdminModule {}
