import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { requireLegacyModule } from '../shared/utils/legacy-module.util';

interface InvoiceAutoBillingModule {
  runMonthlyAutoBillingCycle: (options: { logger?: Logger }) => Promise<unknown>;
}

@Injectable()
export class AutoBillingJob {
  private readonly logger = new Logger(AutoBillingJob.name);

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runMonthlyAutoBillingCycle(): Promise<void> {
    // 1. Load legacy monthly auto-billing implementation to preserve existing rules
    const billingModule = requireLegacyModule<InvoiceAutoBillingModule>('src/legacy/utils/invoiceAutoBilling.js');

    // 2. Trigger cycle and log result for observability
    await billingModule.runMonthlyAutoBillingCycle({ logger: this.logger });
  }
}
