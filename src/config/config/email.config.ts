import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@tarteel.com',
  fromName: process.env.EMAIL_FROM_NAME || 'Tarteel',
}));
