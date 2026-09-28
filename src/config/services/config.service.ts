import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly nestConfigService: NestConfigService) {}

  getPort(): number {
    return Number(this.nestConfigService.get<string>('PORT') || 3000);
  }

  getNodeEnv(): string {
    return this.nestConfigService.get<string>('NODE_ENV') || 'development';
  }

  getClientApp(): string {
    return this.nestConfigService.get<string>('CLIENT_APP') || 'parent-app';
  }

  getConfigStatus(): Record<string, unknown> {
    return {
      nodeEnv: this.getNodeEnv(),
      dataBackend: this.nestConfigService.get<string>('DATA_BACKEND') || 'mongo',
      mongoConfigured: Boolean(this.nestConfigService.get<string>('MONGO_URI')),
      smtpConfigured: Boolean(this.nestConfigService.get<string>('SMTP_HOST')),
      stripeConfigured: Boolean(this.nestConfigService.get<string>('STRIPE_SECRET_KEY')),
      paypalConfigured: Boolean(this.nestConfigService.get<string>('PAYPAL_CLIENT_ID')),
    };
  }
}
