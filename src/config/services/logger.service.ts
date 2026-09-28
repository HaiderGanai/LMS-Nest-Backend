import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService extends ConsoleLogger {
  logStep(step: string, details?: Record<string, unknown>): void {
    this.log(details ? `${step} ${JSON.stringify(details)}` : step);
  }
}
