import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { SalariesController } from './controllers/salaries.controller';
import { SalaryAdvancesController } from './controllers/salary-advances.controller';
import { SalaryAdvanceModelName, SalaryAdvanceSchema } from './entities/salary-advance.entity';
import { SalaryModelName, SalarySchema } from './entities/salary.entity';
import { SalaryAdvancesService } from './services/salary-advances.service';
import { SalariesService } from './services/salaries.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: SalaryModelName, schema: SalarySchema },
      { name: SalaryAdvanceModelName, schema: SalaryAdvanceSchema },
    ]),
  ],
  controllers: [SalariesController, SalaryAdvancesController],
  providers: [SalariesService, SalaryAdvancesService],
  exports: [SalariesService, SalaryAdvancesService],
})
export class SalariesModule {}
