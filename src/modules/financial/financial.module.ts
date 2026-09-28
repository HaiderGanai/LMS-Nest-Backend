import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FamilyModelName, FamilySchema } from '../families/entities/family.entity';
import { EmployeeModelName, EmployeeSchema } from '../employees/entities/employee.entity';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { SharedModule } from '../../shared/shared.module';
import { FamilyScopeMiddleware } from '../../shared/middleware/family-scope.middleware';
import { ClassHoursController } from './controllers/class-hours.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { PaymentsController } from './controllers/payments.controller';
import { ClassHoursModelName, ClassHoursSchema } from './entities/class-hours.entity';
import { InvoiceModelName, InvoiceSchema } from './entities/invoice.entity';
import { PaymentModelName, PaymentSchema } from './entities/payment.entity';
import { PayPalWebhookHandler } from './integrations/paypal-webhook.handler';
import { StripeWebhookHandler } from './integrations/stripe-webhook.handler';
import { BillingService } from './services/billing.service';
import { ClassHoursService } from './services/class-hours.service';
import { InvoicesService } from './services/invoices.service';
import { PayPalService } from './services/paypal.service';
import { PaymentsService } from './services/payments.service';
import { StripeService } from './services/stripe.service';

// User model (needed by PaymentsService for parent lookup)
const UserModelName = 'User';
const UserSchema = getLegacyModelSchema(UserModelName);

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: InvoiceModelName, schema: InvoiceSchema },
      { name: PaymentModelName, schema: PaymentSchema },
      { name: ClassHoursModelName, schema: ClassHoursSchema },
      { name: FamilyModelName, schema: FamilySchema },
      { name: UserModelName, schema: UserSchema },
      { name: EmployeeModelName, schema: EmployeeSchema },
    ]),
  ],
  controllers: [InvoicesController, PaymentsController, ClassHoursController],
  providers: [
    InvoicesService,
    PaymentsService,
    ClassHoursService,
    StripeService,
    PayPalService,
    BillingService,
    StripeWebhookHandler,
    PayPalWebhookHandler,
  ],
  exports: [InvoicesService, PaymentsService, ClassHoursService, BillingService],
})
export class FinancialModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply FamilyScopeMiddleware to all routes that carry RequireAdminDept(70) + FamilyScope
    consumer
      .apply(FamilyScopeMiddleware)
      .forRoutes(
        // Invoices
        { path: 'api/invoices', method: RequestMethod.GET },
        { path: 'api/invoices/:id', method: RequestMethod.GET },
        { path: 'api/invoices/:id/payment-link', method: RequestMethod.GET },
        // Payments
        { path: 'api/payments', method: RequestMethod.GET },
        { path: 'api/payments/invoice/:invoiceId', method: RequestMethod.GET },
        { path: 'api/payments/family/:familyId', method: RequestMethod.GET },
        // Class hours
        { path: 'api/class-hours', method: RequestMethod.GET },
      );
  }
}
