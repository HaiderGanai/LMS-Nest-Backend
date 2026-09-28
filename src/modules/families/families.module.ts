import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { FamiliesController } from './controllers/families.controller';
import { FamilyMembersController } from './controllers/family-members.controller';
import { FamilyModelName, FamilySchema } from './entities/family.entity';
import { FamilyMemberModelName, FamilyMemberSchema } from './entities/family-member.entity';
import { FamilyStudentModelName, FamilyStudentSchema } from './entities/student.entity';
import { FamiliesRepository } from './repositories/families.repository';
import { FamilyCredentialsService } from './services/family-credentials.service';
import { FamilyMembersService } from './services/family-members.service';
import { FamiliesService } from './services/families.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SharedModule,
    SignalingModule,
    MongooseModule.forFeature([
      { name: FamilyModelName, schema: FamilySchema },
      { name: FamilyMemberModelName, schema: FamilyMemberSchema },
      { name: FamilyStudentModelName, schema: FamilyStudentSchema },
      { name: 'LocalAuthCredential', schema: getLegacyModelSchema('LocalAuthCredential') },
      { name: 'User', schema: getLegacyModelSchema('User') },
    ]),
  ],
  controllers: [FamiliesController, FamilyMembersController],
  providers: [
    FamiliesService,
    FamilyMembersService,
    FamilyCredentialsService,
    FamiliesRepository,
  ],
  exports: [FamiliesService, FamilyMembersService, FamilyCredentialsService],
})
export class FamiliesModule {}
