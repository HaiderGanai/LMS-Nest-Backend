import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { DailyClassesController } from './controllers/daily-classes.controller';
import { DailyClassModelName, DailyClassSchema } from './entities/daily-class.entity';
import { DailyClassesService } from './services/daily-classes.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: DailyClassModelName, schema: DailyClassSchema },
      { name: 'ScheduleBooking', schema: getLegacyModelSchema('ScheduleBooking') },
      { name: 'Family', schema: getLegacyModelSchema('Family') },
    ]),
  ],
  controllers: [DailyClassesController],
  providers: [DailyClassesService],
  exports: [DailyClassesService],
})
export class DailyClassesModule {}
