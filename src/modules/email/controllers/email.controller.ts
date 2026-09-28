import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { EmailService } from '../services/email.service';

@Controller('/api/email')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('/send')
  @RequireRoles('admin', 'manager')
  async send(@Body() body: any) {
    return this.emailService.send(body);
  }

  @Post('/invoice')
  @RequireRoles('admin', 'manager')
  async invoice(@Body() body: { to: string; number?: string; subject?: string; html?: string }) {
    return this.emailService.sendInvoiceEmail(body.to, body);
  }
}
