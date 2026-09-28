import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MinPermission, RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AdminService } from '../services/admin.service';
import { TeacherService } from '../services/teacher.service';
import { UsersService } from '../services/users.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly teacherService: TeacherService,
    private readonly adminService: AdminService,
  ) {}

  @Get('/api/users')
  async getUsers() {
    return this.usersService.getUsers();
  }

  @Post('/api/users')
  async createUser(@Body() body: CreateUserDto) {
    return this.usersService.createUser(body);
  }

  @Get(['/api/users/:id', '/api/user/:id'])
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Put('/api/users/:id')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.updateUser(id, body);
  }

  @Delete('/api/users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  // Teacher routes — JWT required, no role restriction (overrides class-level @RequireRoles('admin'))

  @Get('/api/teachers')
  @RequireRoles()
  async getTeachers() {
    return this.teacherService.getTeachers();
  }

  @Get('/api/teacher/:teacherId')
  @RequireRoles()
  async getTeacherById(@Param('teacherId') teacherId: string) {
    return this.teacherService.getTeacherById(teacherId);
  }

  @Get('/api/teacher/:teacherId/students')
  @RequireRoles()
  async getTeacherStudents(@Param('teacherId') teacherId: string) {
    return this.teacherService.getTeacherStudents(teacherId);
  }

  @Get('/teacher/:teacherId/students-multi-profile')
  @RequireRoles()
  async getTeacherStudentsMultiProfile(@Param('teacherId') teacherId: string) {
    return this.teacherService.getTeacherStudents(teacherId);
  }

  // Admin routes — JWT + min permission 100

  @Get('/api/admins')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  @RequireRoles()
  async getAdmins() {
    return this.adminService.getMergedAdmins();
  }
}
