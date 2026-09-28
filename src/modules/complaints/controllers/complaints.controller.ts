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
import { CreateComplaintDto } from '../dto/create-complaint.dto';
import { ComplaintsService } from '../services/complaints.service';

@Controller('api/complaints')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  async getComplaints(@Query() query: Record<string, unknown>) {
    return this.complaintsService.getComplaints(query);
  }

  @Post()
  async createComplaint(@Body() body: CreateComplaintDto) {
    return this.complaintsService.createComplaint(body);
  }

  @Get('/:id')
  async getComplaintById(@Param('id') id: string) {
    return this.complaintsService.getComplaintById(id);
  }

  @Put('/:id')
  async updateComplaint(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.complaintsService.updateComplaint(id, body);
  }

  @Put('/:id/resolve')
  async resolveComplaint(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.complaintsService.resolveComplaint(id, body);
  }

  @Delete('/:id')
  async deleteComplaint(@Param('id') id: string) {
    return this.complaintsService.deleteComplaint(id);
  }
}
