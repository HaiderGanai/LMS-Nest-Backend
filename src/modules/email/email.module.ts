import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { EmailController } from './controllers/email.controller';
import { EmailService } from './services/email.service';

@Module({
  imports: [SharedModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
