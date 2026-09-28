import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { AlertPatternsService } from '../services/alert-patterns.service';

@Controller('/api/admin/alert-patterns')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class AlertPatternsController {
  constructor(private readonly service: AlertPatternsService) {}

  @Get('/')
  async list() { return this.service.list(); }

  @Post('/')
  async create(@Body() body: any) { return this.service.create(body); }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Delete('/:id')
  async remove(@Param('id') id: string) { return this.service.remove(id); }
}
