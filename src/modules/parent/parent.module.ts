import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { UserModelName, UserSchema } from '../users/entities/user.entity';
import { StudentModelName, StudentSchema } from '../students/entities/student.entity';
import { CallAlertModelName, CallAlertSchema } from '../alerts/entities/call-alert.entity';
import { DailyClassModelName, DailyClassSchema } from '../daily-classes/entities/daily-class.entity';
import { ParentController } from './controllers/parent.controller';
import { ParentService } from './services/parent.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: UserModelName, schema: UserSchema },
      { name: StudentModelName, schema: StudentSchema },
      { name: CallAlertModelName, schema: CallAlertSchema },
      { name: DailyClassModelName, schema: DailyClassSchema },
    ]),
  ],
  controllers: [ParentController],
  providers: [ParentService],
  exports: [ParentService],
})
export class ParentModule {}
