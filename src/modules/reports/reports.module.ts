import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { FamilyModelName, FamilySchema } from '../families/entities/family.entity';
import { FamilyMemberModelName, FamilyMemberSchema } from '../families/entities/family-member.entity';
import { DailyClassModelName, DailyClassSchema } from '../daily-classes/entities/daily-class.entity';
import { SalaryModelName, SalarySchema } from '../salaries/entities/salary.entity';
import { ReportsController } from './controllers/reports.controller';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: FamilyModelName, schema: FamilySchema },
      { name: FamilyMemberModelName, schema: FamilyMemberSchema },
      { name: DailyClassModelName, schema: DailyClassSchema },
      { name: SalaryModelName, schema: SalarySchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
