import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { TasksService } from '../services/tasks.service';

@Controller('/api/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('/stats')
  @RequireRoles('admin', 'manager')
  async stats(@Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    return this.tasksService.stats(uid);
  }

  @Get('/')
  @RequireRoles('admin', 'manager')
  async list(@Query() query: any) {
    return this.tasksService.list(query);
  }

  @Get('/:id')
  @RequireRoles('admin', 'manager')
  async get(@Param('id') id: string) {
    return this.tasksService.get(id);
  }

  @Post('/')
  @RequireRoles('admin', 'manager')
  async create(@Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.tasksService.create(body, uid, uname);
  }

  @Put('/:id')
  @RequireRoles('admin', 'manager')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.tasksService.update(id, body);
  }

  @Delete('/:id')
  @RequireRoles('admin', 'manager')
  async remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  @Post('/:id/notes')
  @RequireRoles('admin', 'manager')
  async addNote(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.tasksService.addNote(id, body.text, uid, uname);
  }

  @Post('/:id/reply')
  @RequireRoles('admin', 'manager', 'teacher')
  async addReply(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.tasksService.addReply(id, body.text, body.type || 'update', uid, uname);
  }

  @Put('/:id/reschedule')
  @RequireRoles('admin', 'manager')
  async reschedule(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.tasksService.reschedule(id, new Date(body.newDate), body.reason || '', uid, uname);
  }
}
