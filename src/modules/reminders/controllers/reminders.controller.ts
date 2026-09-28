import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { RemindersService } from '../services/reminders.service';

@Controller('/api/reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('/')
  @RequireRoles('admin', 'manager', 'teacher', 'parent')
  async list(@Query() query: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    return this.remindersService.list(uid, query);
  }

  @Post('/')
  @RequireRoles('admin', 'manager', 'teacher')
  async create(@Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.remindersService.create(body, uid, uname);
  }

  @Put('/:id')
  @RequireRoles('admin', 'manager', 'teacher')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.remindersService.update(id, body);
  }

  @Delete('/:id')
  @RequireRoles('admin', 'manager', 'teacher')
  async remove(@Param('id') id: string) {
    return this.remindersService.remove(id);
  }
}
