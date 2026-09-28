import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { NewsService } from '../services/news.service';

@Controller('/api/news')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('/')
  @RequireRoles('admin', 'manager')
  async list(@Query() query: any) {
    return this.newsService.list(query);
  }

  @Get('/count')
  @RequireRoles('admin', 'manager')
  async count() {
    return this.newsService.count();
  }

  @Post('/')
  @RequireRoles('admin', 'manager')
  async create(@Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    return this.newsService.create(body, uid);
  }

  @Post('/:id/notes')
  @RequireRoles('admin', 'manager')
  async addNote(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const uid = req.auth?.uid || req.user?.uid || '';
    const uname = req.auth?.name || req.user?.name;
    return this.newsService.addNote(id, body.text, uid, uname);
  }

  @Delete('/:id/notes/:noteId')
  @RequireRoles('admin', 'manager')
  async removeNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.newsService.removeNote(id, noteId);
  }

  @Delete('/:id')
  @RequireRoles('admin', 'manager')
  async remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
