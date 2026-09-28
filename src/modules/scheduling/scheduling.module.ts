import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { AssignmentRequestsController } from './controllers/assignment-requests.controller';
import { BookingsController } from './controllers/bookings.controller';
import { SchedulingController } from './controllers/scheduling.controller';
import {
  ScheduleAssignmentRequestModelName,
  ScheduleAssignmentRequestSchema,
} from './entities/schedule-assignment-request.entity';
import { ScheduleAvailabilityModelName, ScheduleAvailabilitySchema } from './entities/schedule-availability.entity';
import { ScheduleBookingModelName, ScheduleBookingSchema } from './entities/schedule-booking.entity';
import { SchedulingRepository } from './repositories/scheduling.repository';
import { ScheduleAssignmentService } from './services/schedule-assignment.service';
import { SchedulingService } from './services/scheduling.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: ScheduleAvailabilityModelName, schema: ScheduleAvailabilitySchema },
      { name: ScheduleBookingModelName, schema: ScheduleBookingSchema },
      { name: ScheduleAssignmentRequestModelName, schema: ScheduleAssignmentRequestSchema },
    ]),
  ],
  controllers: [
    SchedulingController,
    BookingsController,
    AssignmentRequestsController,
  ],
  providers: [
    SchedulingRepository,
    SchedulingService,
    ScheduleAssignmentService,
  ],
  exports: [SchedulingService, ScheduleAssignmentService],
})
export class SchedulingModule {}
