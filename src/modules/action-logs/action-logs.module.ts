import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { ActionLogsController } from './controllers/action-logs.controller';
import { ActionLogModelName, ActionLogSchema } from './entities/action-log.entity';
import { ActionLogsService } from './services/action-logs.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: ActionLogModelName, schema: ActionLogSchema }]),
  ],
  controllers: [ActionLogsController],
  providers: [ActionLogsService],
  exports: [ActionLogsService],
})
export class ActionLogsModule {}
