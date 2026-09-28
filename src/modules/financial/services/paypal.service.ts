import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PayPalService {
  constructor(private readonly nestConfigService: ConfigService) {}

  async createCheckoutSession(payload: { invoiceId: string; amount: number }): Promise<{ checkoutUrl: string }> {
    const successUrl = this.nestConfigService.get<string>('payment.successUrl') || '/payments/paypal/return';
    const checkoutUrl = `${successUrl}?invoiceId=${payload.invoiceId}&amount=${payload.amount}`;
    return { checkoutUrl };
  }
}
