import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { StudentsController } from './controllers/students.controller';
import { StudentModelName, StudentSchema } from './entities/student.entity';
import { StudentUserModelName, StudentUserSchema } from './entities/user.entity';
import { CallLogModelName, CallLogSchema } from '../calls/entities/call-log.entity';
import { StudentsRepository } from './repositories/students.repository';
import { StudentStatsService } from './services/student-stats.service';
import { StudentsService } from './services/students.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: StudentModelName, schema: StudentSchema },
      { name: StudentUserModelName, schema: StudentUserSchema },
      { name: CallLogModelName, schema: CallLogSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService, StudentStatsService, StudentsRepository],
  exports: [StudentsService, StudentStatsService],
})
export class StudentsModule {}
