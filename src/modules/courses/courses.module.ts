import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { StudentModelName, StudentSchema } from '../students/entities/student.entity';
import { CoursesController } from './controllers/courses.controller';
import { CourseModelName, CourseSchema } from './entities/course.entity';
import { CoursesService } from './services/courses.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: CourseModelName, schema: CourseSchema },
      { name: StudentModelName, schema: StudentSchema },
    ]),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
