import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { RemindersController } from './controllers/reminders.controller';
import { ReminderModelName, ReminderSchema } from './entities/reminder.entity';
import { RemindersService } from './services/reminders.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: ReminderModelName, schema: ReminderSchema }]),
  ],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
