import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { TasksController } from './controllers/tasks.controller';
import { TaskModelName, TaskSchema } from './entities/task.entity';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: TaskModelName, schema: TaskSchema }]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
