import { Injectable } from '@nestjs/common';
import { CallAlertsService } from './call-alerts.service';
import { MessageAlertsService } from './message-alerts.service';
import { VideoAlertsService } from './video-alerts.service';

@Injectable()
export class AlertsNotificationService {
  constructor(
    private readonly callAlertsService: CallAlertsService,
    private readonly videoAlertsService: VideoAlertsService,
    private readonly messageAlertsService: MessageAlertsService,
  ) {}

  async getAlerts(query: Record<string, string> = {}): Promise<Record<string, unknown>> {
    return this.callAlertsService.listAlerts(query);
  }
}
