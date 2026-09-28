import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export interface SendMailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class MailService {
  constructor(private readonly nestConfigService: NestConfigService) {}

  private buildTransporter() {
    return nodemailer.createTransport({
      host: this.nestConfigService.get<string>('email.host'),
      port: this.nestConfigService.get<number>('email.port'),
      secure: this.nestConfigService.get<boolean>('email.secure'),
      auth: {
        user: this.nestConfigService.get<string>('email.user'),
        pass: this.nestConfigService.get<string>('email.pass'),
      },
    });
  }

  async sendEmail(payload: SendMailPayload): Promise<{ message: string }> {
    // 1. Build transporter from centralized environment configuration
    const transporter = this.buildTransporter();

    // 2. Send email with explicit sender metadata
    const result = await transporter.sendMail({
      from: {
        name: this.nestConfigService.get<string>('email.fromName') || 'Tarteel',
        address: this.nestConfigService.get<string>('email.fromEmail') || 'no-reply@tarteel.com',
      },
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    // 3. Validate nodemailer response before returning success
    if (!result.messageId) {
      throw new InternalServerErrorException('Email provider did not return a message id');
    }

    return { message: 'Email sent successfully' };
  }
}
