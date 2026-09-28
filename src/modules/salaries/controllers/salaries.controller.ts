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
import { CreateSalaryDto } from '../dto/create-salary.dto';
import { SalariesService } from '../services/salaries.service';

@Controller('api/salaries')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get()
  async getSalaries(@Query() query: Record<string, unknown>) {
    return this.salariesService.getSalaries(query);
  }

  @Get('/stats')
  async getSalaryStats() {
    return this.salariesService.getSalaryStats();
  }

  @Post()
  async createSalary(@Body() body: CreateSalaryDto) {
    return this.salariesService.createSalary(body);
  }

  @Get('/:id')
  async getSalaryById(@Param('id') id: string) {
    return this.salariesService.getSalaryById(id);
  }

  @Put('/:id')
  async updateSalary(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.salariesService.updateSalary(id, body);
  }

  @Delete('/:id')
  async deleteSalary(@Param('id') id: string) {
    return this.salariesService.deleteSalary(id);
  }

  @Post('/:id/approve')
  async approveSalary(@Param('id') id: string) {
    return this.salariesService.approveSalary(id);
  }

  @Post('/:id/pay')
  async paySalary(@Param('id') id: string) {
    return this.salariesService.paySalary(id);
  }
}
