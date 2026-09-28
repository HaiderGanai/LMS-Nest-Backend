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
import { AdminDeptGuard } from '../../../shared/guards/admin-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { RequireAdminDept, MinPermission } from '../../../shared/decorators/require-roles.decorator';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';
import { InvoicesService } from '../services/invoices.service';

@Controller('api/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // 1. GET /api/invoices — RequireAdminDept(70) + FamilyScope
  @Get()
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(70)
  async getInvoices(
    @Query() query: Record<string, unknown>,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.invoicesService.getInvoices(query, req);
  }

  // 2. GET /api/invoices/stats — MinPermission(100)
  @Get('stats')
  @UseGuards(MinPermissionGuard)
  @MinPermission(100)
  async getInvoiceStats(@Query() query: Record<string, unknown>) {
    return this.invoicesService.getInvoiceStats(query);
  }

  // 3. POST /api/invoices — RequireAdminDept(80)
  @Post()
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async createInvoice(@Body() body: Record<string, unknown>) {
    return this.invoicesService.createInvoice(body);
  }

  // 4. GET /api/invoices/:id — RequireAdminDept(70) + FamilyScope
  @Get(':id')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(70)
  async getInvoiceById(
    @Param('id') id: string,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.invoicesService.getInvoiceById(id, req);
  }

  // 5. GET /api/invoices/:id/payment-link — RequireAdminDept(70) + FamilyScope
  @Get(':id/payment-link')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(70)
  async getPaymentLink(
    @Param('id') id: string,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.invoicesService.getPaymentLink(
      id,
      req as FamilyScopedRequest & {
        headers: Record<string, string | string[] | undefined>;
        get(name: string): string | undefined;
      },
    );
  }

  // 6. PUT /api/invoices/:id — RequireAdminDept(80)
  @Put(':id')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async updateInvoice(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicesService.updateInvoice(id, body);
  }

  // 7. DELETE /api/invoices/:id — RequireAdminDept(90)
  @Delete(':id')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(90)
  async deleteInvoice(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicesService.deleteInvoice(id, query, body);
  }

  // 8. POST /api/invoices/:id/send — RequireAdminDept(80)
  @Post(':id/send')
  @UseGuards(AdminDeptGuard)
  @RequireAdminDept(80)
  async sendInvoice(@Param('id') id: string) {
    return this.invoicesService.sendInvoice(id);
  }
}
