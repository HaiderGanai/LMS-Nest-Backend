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
import { UpdateStudentDto } from '../dto/update-student.dto';
import { StudentStatsService } from '../services/student-stats.service';
import { StudentsService } from '../services/students.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentStatsService: StudentStatsService,
  ) {}

  @Get('/api/students')
  @RequireRoles('admin')
  async getStudents() {
    return this.studentsService.getStudents();
  }

  @Get('/api/students/:id')
  @RequireRoles('admin', 'teacher', 'parent')
  async getStudentById(@Param('id') id: string) {
    return this.studentsService.getStudentById(id);
  }

  @Put('/api/students/:id')
  @RequireRoles('admin')
  async updateStudent(@Param('id') id: string, @Body() body: UpdateStudentDto) {
    return this.studentsService.updateStudent(id, body);
  }

  @Get('/students/list/:parentId')
  @RequireRoles('parent', 'admin')
  async listStudentsByParentId(@Param('parentId') parentId: string) {
    return this.studentsService.listStudentsByParentId(parentId);
  }

  @Post('/students/create')
  @RequireRoles('admin', 'parent')
  async createStudent(@Body() body: Record<string, unknown>) {
    return this.studentsService.createStudent(body);
  }

  @Put('/students/:studentId')
  @RequireRoles('admin', 'parent')
  async updateStudentByLegacyRoute(@Param('studentId') studentId: string, @Body() body: UpdateStudentDto) {
    return this.studentsService.updateStudent(studentId, body);
  }

  @Delete('/students/:studentId')
  @RequireRoles('admin', 'parent')
  async deleteStudent(@Param('studentId') studentId: string) {
    return this.studentsService.deleteStudent(studentId);
  }

  @Post('/students/set-active')
  @RequireRoles('parent', 'admin')
  async setActiveStudent(@Body() body: { parentId: string; studentId: string }) {
    return this.studentsService.setActiveStudent(body.parentId, body.studentId);
  }

  @Post('/students/:studentId/assign-teacher')
  @RequireRoles('admin')
  async assignStudentTeacher(@Param('studentId') studentId: string, @Body() body: { teacherId: string }) {
    return this.studentsService.assignStudentTeacher(studentId, body.teacherId);
  }

  @Get('/api/student/:studentId/profile')
  @RequireRoles('admin', 'teacher', 'parent')
  async getStudentProfile(@Param('studentId') studentId: string) {
    return this.studentsService.getStudentProfile(studentId);
  }

  @Get('/api/student/:studentId/statistics')
  @RequireRoles('admin', 'teacher', 'parent')
  async getStudentStatistics(@Param('studentId') studentId: string) {
    return this.studentStatsService.getStudentStatistics(studentId);
  }

  @Get('/api/student/:studentId/diary-notes')
  @RequireRoles('admin', 'teacher', 'parent')
  async getStudentDiaryNotes(
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.getStudentDiaryNotes(studentId, limit ? parseInt(limit) : 10);
  }

  @Get('/api/student/:studentId/call-logs')
  @RequireRoles('admin', 'teacher', 'parent')
  async getStudentCallLogs(
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.studentsService.getStudentCallLogs(studentId, parseInt(limit || '10'), parseInt(offset || '0'));
  }
}
