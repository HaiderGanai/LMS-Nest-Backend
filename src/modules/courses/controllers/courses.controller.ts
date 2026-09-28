import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { AssignCoursesDto } from '../dto/assign-courses.dto';
import { CreateCourseDto } from '../dto/create-course.dto';
import { UpdateCourseDto } from '../dto/update-course.dto';
import { CoursesService } from '../services/courses.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get('/api/courses')
  @RequireRoles('admin', 'teacher', 'parent', 'manager')
  async list(@Query('category') category?: string) {
    return this.coursesService.list(category);
  }

  @Post('/api/courses')
  @RequireRoles('admin', 'manager')
  async create(@Body() body: CreateCourseDto) {
    return this.coursesService.create(body);
  }

  @Put('/api/courses/:id')
  @RequireRoles('admin', 'manager')
  async update(@Param('id') id: string, @Body() body: UpdateCourseDto) {
    return this.coursesService.update(id, body);
  }

  @Delete('/api/courses/:id')
  @RequireRoles('admin', 'manager')
  async remove(@Param('id') id: string) {
    return this.coursesService.softDelete(id);
  }

  @Put('/api/students/:studentId/assign-courses')
  @RequireRoles('admin', 'manager', 'parent')
  async assign(
    @Param('studentId') studentId: string,
    @Body() body: AssignCoursesDto,
  ) {
    return this.coursesService.assignToStudent(studentId, body.courseIds);
  }

  @Get('/api/students/:studentId/courses')
  @RequireRoles('admin', 'teacher', 'parent', 'manager')
  async getStudentCourses(@Param('studentId') studentId: string) {
    return this.coursesService.getStudentCourses(studentId);
  }
}
