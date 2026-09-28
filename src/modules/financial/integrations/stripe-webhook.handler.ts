import { Injectable } from '@nestjs/common';

@Injectable()
export class StripeWebhookHandler {
  async handleWebhook(body: Record<string, unknown>): Promise<{ received: boolean; provider: string; body: Record<string, unknown> }> {
    return {
      received: true,
      provider: 'stripe',
      body,
    };
  }
}
