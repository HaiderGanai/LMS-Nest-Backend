import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface InvoiceAutoBillingModule {
  runMonthlyAutoBillingCycle: (options: { logger?: Console }) => Promise<unknown>;
}

@Injectable()
export class BillingService {
  private readonly invoiceAutoBillingModule: InvoiceAutoBillingModule = requireLegacyModule<InvoiceAutoBillingModule>('src/legacy/utils/invoiceAutoBilling.js');

  async runMonthlyAutoBillingCycle(): Promise<unknown> {
    return this.invoiceAutoBillingModule.runMonthlyAutoBillingCycle({ logger: console });
  }
}
