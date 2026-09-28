import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { DatabaseService } from './services/database.service';
import { MailService } from './services/mail.service';

interface SendEmailBody {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Controller()
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  @Get('/')
  getRoot() {
    return { message: 'LMS backend service is running...' };
  }

  @Get('/health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: this.databaseService.getConnectionState(),
    };
  }

  @Get('/api/config')
  getConfig() {
    return this.configService.getConfigStatus();
  }

  @Get('/api/config/status')
  getConfigStatus() {
    return this.configService.getConfigStatus();
  }

  @Post('/api/email/send')
  async sendEmail(@Body() body: SendEmailBody) {
    return this.mailService.sendEmail(body);
  }

  @Post('/api/email/invoice')
  async sendInvoiceEmail(@Body() body: SendEmailBody) {
    return this.mailService.sendEmail(body);
  }

  @Get('/api/announcements')
  getAnnouncements() {
    return { announcements: [] };
  }
}
