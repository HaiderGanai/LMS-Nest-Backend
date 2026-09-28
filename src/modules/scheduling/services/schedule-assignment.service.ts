import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';
import type { AssignmentRequestDto } from '../dto/assignment-request.dto';

interface LegacyDbModule {
  connectMongo: () => Promise<unknown>;
}

interface ScheduleAssignmentLegacyModule {
  createAssignmentRequests: (payload: unknown) => Promise<unknown>;
  listAssignmentRequests: (payload?: unknown) => Promise<unknown>;
  respondToAssignmentRequest: (payload: unknown) => Promise<unknown>;
  finalizeAssignmentRequest: (payload: unknown) => Promise<unknown>;
}

@Injectable()
export class ScheduleAssignmentService {
  private readonly legacyDbModule: LegacyDbModule = requireLegacyModule<LegacyDbModule>('src/legacy/db.js');
  private readonly scheduleAssignmentLegacyModule: ScheduleAssignmentLegacyModule =
    requireLegacyModule<ScheduleAssignmentLegacyModule>('src/legacy/utils/scheduleAssignmentRequestService.js');
  private readonly legacyMongoReady: Promise<unknown> = this.legacyDbModule.connectMongo();

  private async ensureLegacyMongoConnected(): Promise<void> {
    await this.legacyMongoReady;
  }

  private throwMappedLegacyError(operation: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = String(message || '').trim().toLowerCase();
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? Number((error as { statusCode?: number }).statusCode)
      : null;

    // eslint-disable-next-line no-console
    console.error(`[ScheduleAssignmentService] ${operation} failed`, {
      message,
      statusCode,
      error,
    });

    if (statusCode && statusCode >= 400 && statusCode < 600) {
      if (statusCode === 409) {
        throw new ConflictException(message || `${operation} conflict`);
      }
      if (statusCode === 403) {
        throw new ForbiddenException(message || `${operation} forbidden`);
      }
      throw new HttpException(message || `Failed to ${operation}`, statusCode);
    }

    if (normalized.includes('not found')) {
      throw new NotFoundException(message || `${operation} not found`);
    }

    if (
      normalized.includes('permission')
      || normalized.includes('forbidden')
      || normalized.includes('not allowed')
    ) {
      throw new ForbiddenException(message || `${operation} forbidden`);
    }

    if (
      normalized.includes('required')
      || normalized.includes('must be')
      || normalized.includes('valid')
      || normalized.includes('invalid')
      || normalized.includes('already')
    ) {
      throw new BadRequestException(message || `Invalid request for ${operation}`);
    }

    throw new InternalServerErrorException(message || `Failed to ${operation}`);
  }

  async createAssignmentRequests(body: AssignmentRequestDto): Promise<unknown> {
    // eslint-disable-next-line no-console
    console.log('[ScheduleAssignmentService] createAssignmentRequests', {
      requestedBy: (body as unknown as Record<string, unknown>)?.requestedBy || 'admin',
      familyId: (body as unknown as Record<string, unknown>)?.familyId || null,
      familyMemberId: (body as unknown as Record<string, unknown>)?.familyMemberId || null,
      studentDate: (body as unknown as Record<string, unknown>)?.studentDate || null,
      studentTime: (body as unknown as Record<string, unknown>)?.studentTime || null,
      durationMinutes: Number((body as unknown as Record<string, unknown>)?.durationMinutes || 0),
      requiredDaysCount: Array.isArray((body as unknown as Record<string, unknown>)?.requiredDays)
        ? ((body as unknown as Record<string, unknown>).requiredDays as unknown[]).length
        : 0,
      teacherCount: Array.isArray((body as unknown as Record<string, unknown>)?.teacherIds)
        ? ((body as unknown as Record<string, unknown>).teacherIds as unknown[]).length
        : 0,
    });

    try {
      await this.ensureLegacyMongoConnected();
      const result = await this.scheduleAssignmentLegacyModule.createAssignmentRequests(body);

      // eslint-disable-next-line no-console
      console.log('[ScheduleAssignmentService] createAssignmentRequests done', {
        requestedBy: (body as unknown as Record<string, unknown>)?.requestedBy || 'admin',
        batchId: (result as Record<string, unknown>)?.batchId || null,
        createdCount: Number((result as Record<string, unknown>)?.createdCount || 0),
        reusedCount: Number((result as Record<string, unknown>)?.reusedCount || 0),
        skippedCount: Array.isArray((result as Record<string, unknown>)?.skippedTeachers)
          ? ((result as Record<string, unknown>).skippedTeachers as unknown[]).length
          : 0,
      });

      return result;
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('[ScheduleAssignmentService] createAssignmentRequests failed', {
        requestedBy: (body as unknown as Record<string, unknown>)?.requestedBy || 'admin',
        familyId: (body as unknown as Record<string, unknown>)?.familyId || null,
        familyMemberId: (body as unknown as Record<string, unknown>)?.familyMemberId || null,
        teacherIds: Array.isArray((body as unknown as Record<string, unknown>)?.teacherIds)
          ? (body as unknown as Record<string, unknown>).teacherIds
          : [],
        message: error instanceof Error ? error.message : 'Unknown error',
        details: (error as Record<string, unknown>)?.details || null,
      });
      return this.throwMappedLegacyError('createAssignmentRequests', error);
    }
  }

  async listAssignmentRequests(filters: Record<string, unknown>): Promise<unknown> {
    try {
      await this.ensureLegacyMongoConnected();
      return await this.scheduleAssignmentLegacyModule.listAssignmentRequests(filters);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('listAssignmentRequests', error);
    }
  }

  async respondToAssignmentRequest(id: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      await this.ensureLegacyMongoConnected();
      return await this.scheduleAssignmentLegacyModule.respondToAssignmentRequest({
        requestId: id,
        teacherId: body?.teacherId,
        action: body?.action,
        note: body?.note || '',
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('respondToAssignmentRequest', error);
    }
  }

  async finalizeAssignmentRequest(id: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      await this.ensureLegacyMongoConnected();
      return await this.scheduleAssignmentLegacyModule.finalizeAssignmentRequest({
        requestId: id,
        finalizedBy: body?.finalizedBy || 'admin',
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('finalizeAssignmentRequest', error);
    }
  }
}
