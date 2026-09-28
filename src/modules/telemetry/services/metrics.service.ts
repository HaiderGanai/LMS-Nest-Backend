import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  async getSystemHealthMetrics(): Promise<Record<string, unknown>> {
    return {
      uptimeSeconds: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
