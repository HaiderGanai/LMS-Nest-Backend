import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { ComplaintsController } from './controllers/complaints.controller';
import { ComplaintModelName, ComplaintSchema } from './entities/complaint.entity';
import { ViolationModelName, ViolationSchema } from './entities/violation.entity';
import { ComplaintsService } from './services/complaints.service';
import { ViolationsService } from './services/violations.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: ComplaintModelName, schema: ComplaintSchema },
      { name: ViolationModelName, schema: ViolationSchema },
    ]),
  ],
  controllers: [ComplaintsController],
  providers: [ComplaintsService, ViolationsService],
  exports: [ComplaintsService, ViolationsService],
})
export class ComplaintsModule {}
