import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { SalaryAdvanceDto } from '../dto/salary-advance.dto';
import { SalaryAdvancesService } from '../services/salary-advances.service';

@Controller('api/advances')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class SalaryAdvancesController {
  constructor(private readonly salaryAdvancesService: SalaryAdvancesService) {}

  @Get()
  async getSalaryAdvances(@Query() query: Record<string, unknown>) {
    return this.salaryAdvancesService.getSalaryAdvances(query);
  }

  @Post()
  async createSalaryAdvance(@Body() body: SalaryAdvanceDto) {
    return this.salaryAdvancesService.createSalaryAdvance(body);
  }

  @Post('/:id/approve')
  async approveSalaryAdvance(@Param('id') id: string) {
    return this.salaryAdvancesService.approveSalaryAdvance(id);
  }

  @Post('/:id/reject')
  async rejectSalaryAdvance(@Param('id') id: string) {
    return this.salaryAdvancesService.rejectSalaryAdvance(id);
  }
}
