import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { TelemetryEventDto } from '../dto/telemetry-event.dto';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel('CallTelemetryEvent')
    private readonly callTelemetryEventModel: Model<Record<string, unknown>>,
  ) {}

  async createTelemetryEvent(body: TelemetryEventDto): Promise<{ success: boolean; event: Record<string, unknown> }> {
    const callId = String(body.callId || '').trim();
    const eventType = String(body.eventType || '').trim();
    if (!callId) {
      throw new BadRequestException('callId is required');
    }
    if (!eventType) {
      throw new BadRequestException('eventType is required');
    }

    const payloadDataCandidate = body.data ?? body.payload;
    const data = payloadDataCandidate && typeof payloadDataCandidate === 'object'
      ? payloadDataCandidate
      : {};

    const eventAt = body.eventAt ? new Date(body.eventAt) : new Date();
    const normalizedEventAt = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;

    let eventDoc: { toObject?: () => Record<string, unknown> } | Record<string, unknown>;
    try {
      eventDoc = await this.callTelemetryEventModel.create({
        callId,
        roomId: body.roomId || null,
        janusRoomId: Number.isFinite(Number(body.janusRoomId)) ? Number(body.janusRoomId) : null,
        actorRole: body.actorRole || 'system',
        actorId: body.actorId || null,
        app: body.app || 'unknown',
        platform: body.platform || 'unknown',
        eventType,
        severity: body.severity || 'info',
        category: body.category || 'general',
        message: body.message || '',
        data,
        eventAt: normalizedEventAt,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to store telemetry event: ${message}`);
    }

    const event = typeof eventDoc === 'object' && eventDoc !== null && 'toObject' in eventDoc
      ? (eventDoc as { toObject: () => Record<string, unknown> }).toObject()
      : (eventDoc as Record<string, unknown>);

    return { success: true, event };
  }
}
