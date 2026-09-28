import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { AnnouncementsService } from '../services/announcements.service';
import { SignalingBroadcasterService } from '../../signaling/services/signaling-broadcaster.service';

@Controller('/api/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  @Get('/')
  @RequireRoles('admin', 'manager', 'teacher', 'parent')
  async list(@Query() query: any) {
    return this.announcementsService.list(query);
  }

  @Get('/active')
  @RequireRoles('admin', 'manager', 'teacher', 'parent', 'student')
  async active(@Query('audience') audience?: string) {
    return this.announcementsService.active(audience);
  }

  @Get('/:id')
  @RequireRoles('admin', 'manager', 'teacher', 'parent')
  async get(@Param('id') id: string) {
    return this.announcementsService.get(id);
  }

  @Post('/')
  @RequireRoles('admin', 'manager')
  async create(@Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const result = await this.announcementsService.create(body, uid);
    // Real-time broadcast if live now
    const announcement = (result as any)?.announcement || result;
    const now = new Date();
    const start = announcement?.startDate ? new Date(announcement.startDate) : now;
    const end = announcement?.endDate ? new Date(announcement.endDate) : now;
    if (start <= now && end >= now) {
      const payload = {
        id: announcement._id,
        title: announcement.title,
        body: announcement.body || '',
        targetType: announcement.targetType,
        teacherCategory: announcement.teacherCategory,
        startDate: announcement.startDate,
        endDate: announcement.endDate,
      };
      const targetType = announcement.targetType;
      if (targetType === 'student') {
        this.broadcaster.emitToRole('student', 'announcement-published', payload);
        this.broadcaster.emitToRole('parent', 'announcement-published', payload);
      } else if (targetType === 'teacher') {
        this.broadcaster.emitToRole('teacher', 'announcement-published', payload);
      } else {
        this.broadcaster.emitToAll('announcement-published', payload);
      }
    }
    return result;
  }

  @Put('/:id')
  @RequireRoles('admin', 'manager')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.announcementsService.update(id, body);
  }

  @Delete('/:id')
  @RequireRoles('admin', 'manager')
  async remove(@Param('id') id: string) {
    return this.announcementsService.remove(id);
  }
}
