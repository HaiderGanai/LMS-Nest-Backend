import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: any[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error('SMTP not configured (SMTP_HOST/USER/PASS missing)');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async send(params: SendEmailParams): Promise<{ success: true; messageId: string }> {
    const transporter = this.getTransporter();
    const from = process.env.SMTP_FROM || `"LMS" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(params.to) ? params.to.join(',') : params.to,
      cc: params.cc ? (Array.isArray(params.cc) ? params.cc.join(',') : params.cc) : undefined,
      bcc: params.bcc ? (Array.isArray(params.bcc) ? params.bcc.join(',') : params.bcc) : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments,
    });
    this.logger.log(`Email sent: ${info.messageId} to ${params.to}`);
    return { success: true, messageId: info.messageId };
  }

  async sendInvoiceEmail(to: string, invoiceData: { number?: string; html?: string; subject?: string }) {
    return this.send({
      to,
      subject: invoiceData.subject || `Invoice ${invoiceData.number || ''}`,
      html: invoiceData.html || `<p>Please find your invoice attached.</p>`,
    });
  }
}
