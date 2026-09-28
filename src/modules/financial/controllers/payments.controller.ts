import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminDeptGuard } from '../../../shared/guards/admin-dept.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { RequireAdminDept, RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';
import { InvoicesService } from '../services/invoices.service';
import { PaymentsService } from '../services/payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly invoicesService: InvoicesService,
  ) {}

  // 9. GET /api/payments — RequireAdminDept(70) + FamilyScope
  @Get('api/payments')
  @UseGuards(JwtAuthGuard, AdminDeptGuard)
  @RequireAdminDept(70)
  async getPayments(
    @Query() query: Record<string, unknown>,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.paymentsService.getPayments(query, req);
  }

  // 10. POST /api/payments — RequireAdminDept(80)
  @Post('api/payments')
  @UseGuards(JwtAuthGuard, AdminDeptGuard)
  @RequireAdminDept(80)
  async createPayment(@Body() body: Record<string, unknown>) {
    return this.paymentsService.createPayment(body);
  }

  // 11. GET /api/payments/invoice/:invoiceId — RequireAdminDept(70) + FamilyScope
  @Get('api/payments/invoice/:invoiceId')
  @UseGuards(JwtAuthGuard, AdminDeptGuard)
  @RequireAdminDept(70)
  async getPaymentsByInvoiceId(
    @Param('invoiceId') invoiceId: string,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.paymentsService.getPaymentsByInvoiceId(invoiceId, req);
  }

  // 12. GET /api/payments/family/:familyId — RequireAdminDept(70) + FamilyScope
  @Get('api/payments/family/:familyId')
  @UseGuards(JwtAuthGuard, AdminDeptGuard)
  @RequireAdminDept(70)
  async getPaymentsByFamilyId(
    @Param('familyId') familyId: string,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.paymentsService.getPaymentsByFamilyId(familyId, req);
  }

  // 16. GET /api/parent/:parentId/invoices — RequireRoles('parent','admin')
  @Get('api/parent/:parentId/invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('parent', 'admin')
  async getParentInvoices(@Param('parentId') parentId: string) {
    return this.invoicesService.getParentInvoices(parentId);
  }

  // 17. POST /api/parent/:parentId/invoices/:invoiceId/checkout — RequireRoles('parent','admin')
  @Post('api/parent/:parentId/invoices/:invoiceId/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles('parent', 'admin')
  async checkoutInvoice(
    @Param('parentId') parentId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FamilyScopedRequest,
  ) {
    return this.paymentsService.checkoutInvoice(parentId, invoiceId, body, req);
  }

  // 18. GET /payments/invoice/:invoiceId — public, no auth
  @Get('payments/invoice/:invoiceId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getPublicPaymentPage(
    @Param('invoiceId') invoiceId: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const result = await this.paymentsService.getPublicPaymentPageData(invoiceId, query);
    if (!result.valid) {
      res.status(result.statusCode || 400).send(result.error || 'Payment link unavailable');
      return;
    }
    res.status(200).json({ success: true, invoice: result.invoice });
  }

  // 19. GET /payments/stripe/success — public, no auth
  @Get('payments/stripe/success')
  @HttpCode(200)
  async stripeSuccess(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const result = await this.paymentsService.handleStripeSuccess(query);
    res.status(result.statusCode).set('Content-Type', 'text/html; charset=utf-8').send(result.html);
  }

  // 20. GET /payments/stripe/cancel — public, no auth
  @Get('payments/stripe/cancel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  stripeCancel(@Res() res: Response) {
    res.status(200).send(this.paymentsService.handleStripeCancel());
  }

  // 21. GET /payments/paypal/return — public, no auth
  @Get('payments/paypal/return')
  async paypalReturn(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const result = await this.paymentsService.handlePayPalReturn(query);
    res.status(result.statusCode).set('Content-Type', 'text/html; charset=utf-8').send(result.html);
  }

  // 22. GET /payments/paypal/cancel — public, no auth
  @Get('payments/paypal/cancel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  paypalCancel(@Res() res: Response) {
    res.status(200).send(this.paymentsService.handlePayPalCancel());
  }

  // 23. GET /payments/invoice/:invoiceId/checkout — public, signed link (redirect to gateway checkout)
  @Get('payments/invoice/:invoiceId/checkout')
  async publicInvoiceCheckout(
    @Param('invoiceId') invoiceId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.paymentsService.publicInvoiceCheckout(invoiceId, query, req);
    if (result.redirectUrl) {
      res.redirect(result.redirectUrl);
      return;
    }
    res
      .status(result.statusCode || 400)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(result.html || 'Checkout unavailable');
  }

  // 24. GET /payments/stripe/embedded/:invoiceId — public, signed link (renders embedded Stripe page)
  @Get('payments/stripe/embedded/:invoiceId')
  async stripeEmbedded(
    @Param('invoiceId') invoiceId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.paymentsService.stripeEmbeddedCheckout(invoiceId, query, req);
    res
      .status(result.statusCode || 200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(result.html);
  }
}
