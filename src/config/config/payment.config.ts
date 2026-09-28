import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  paypalMode: process.env.PAYPAL_MODE || 'sandbox',
  successUrl: process.env.PAYMENT_SUCCESS_URL || '',
  cancelUrl: process.env.PAYMENT_CANCEL_URL || '',
}));
