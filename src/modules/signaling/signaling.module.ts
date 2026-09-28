import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { UserModelName, UserSchema } from '../users/entities/user.entity';
import { StudentModelName, StudentSchema } from '../students/entities/student.entity';
import {
  FamilyMemberModelName,
  FamilyMemberSchema,
} from '../families/entities/family-member.entity';
import { FamilyModelName, FamilySchema } from '../families/entities/family.entity';
import { SignalingGateway } from './gateways/signaling.gateway';
import { SignalingIdentityService } from './services/signaling-identity.service';
import { SignalingStateService } from './services/signaling-state.service';
import { SignalingBroadcasterService } from './services/signaling-broadcaster.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: UserModelName, schema: UserSchema },
      { name: StudentModelName, schema: StudentSchema },
      { name: FamilyMemberModelName, schema: FamilyMemberSchema },
      { name: FamilyModelName, schema: FamilySchema },
    ]),
  ],
  providers: [
    SignalingGateway,
    SignalingStateService,
    SignalingIdentityService,
    SignalingBroadcasterService,
  ],
  exports: [SignalingStateService, SignalingIdentityService, SignalingBroadcasterService],
})
export class SignalingModule {}
