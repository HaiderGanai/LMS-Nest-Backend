import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SchedulingRepository } from '../repositories/scheduling.repository';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly schedulingRepository: SchedulingRepository,
  ) {}

  private throwMappedLegacyError(operation: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = String(message || '').trim().toLowerCase();
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? Number((error as { statusCode?: number }).statusCode)
      : null;

    // eslint-disable-next-line no-console
    console.error(`[SchedulingService] ${operation} failed`, {
      message,
      statusCode,
      error,
    });

    if (statusCode && statusCode >= 400 && statusCode < 600) {
      if (statusCode === 409) {
        throw new ConflictException(message || `${operation} conflict`);
      }
      throw new HttpException(message || `Failed to ${operation}`, statusCode);
    }

    if (normalized.includes('not found')) {
      throw new NotFoundException(message || `${operation} not found`);
    }

    if (
      normalized.includes('required')
      || normalized.includes('must be')
      || normalized.includes('valid')
      || normalized.includes('invalid')
    ) {
      throw new BadRequestException(message || `Invalid request for ${operation}`);
    }

    throw new InternalServerErrorException(message || `Failed to ${operation}`);
  }

  // ── Availability ──────────────────────────────────────────────────────────

  async listTeacherAvailability(teacherId: string, dateFrom?: string, dateTo?: string): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.listTeacherAvailability({ teacherId, dateFrom, dateTo });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('listTeacherAvailability', error);
    }
  }

  async upsertTeacherAvailability(
    teacherId: string,
    date: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.upsertTeacherAvailability({
        teacherId,
        date,
        timezone: body?.timezone,
        ranges: body?.ranges,
        breaks: body?.breaks,
        notes: body?.notes,
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('upsertTeacherAvailability', error);
    }
  }

  async deleteTeacherAvailabilityBreak(teacherId: string, date: string, breakId: string): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.deleteTeacherAvailabilityBreak({ teacherId, date, breakId });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('deleteTeacherAvailabilityBreak', error);
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async searchAvailableTeachers(body: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.searchAvailableTeachers({
        studentDate: body?.studentDate,
        studentTime: body?.studentTime,
        studentTimezone: body?.studentTimezone,
        durationMinutes: Number(body?.durationMinutes || 30),
        requiredDays: body?.requiredDays,
        includeUnavailable: body?.includeUnavailable === true,
        filters: {
          gender: body?.teacherGender || (body?.filters as Record<string, unknown>)?.gender || '',
          nationality: body?.teacherNationality || (body?.filters as Record<string, unknown>)?.nationality || '',
          category: body?.teacherCategory || (body?.filters as Record<string, unknown>)?.category || '',
        },
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('searchAvailableTeachers', error);
    }
  }

  // ── Assign / Unassign ────────────────────────────────────────────────────

  async assignTeacherSchedule(payload: Record<string, unknown>): Promise<unknown> {
    // eslint-disable-next-line no-console
    console.log('[SchedulingService] assignTeacherSchedule payload', {
      teacherId: payload?.teacherId || null,
      familyId: payload?.familyId || null,
      familyMemberId: payload?.familyMemberId || null,
      studentDate: payload?.studentDate || null,
      studentTime: payload?.studentTime || null,
      requiredDays: Array.isArray(payload?.requiredDays) ? payload.requiredDays : null,
    });

    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.assignTeacherSchedule(payload);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('assignTeacherSchedule', error);
    }
  }

  async unassignTeacherSchedule(payload: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.unassignTeacherSchedule(payload);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('unassignTeacherSchedule', error);
    }
  }

  // ── Shift ─────────────────────────────────────────────────────────────────

  async getShiftCandidates(teacherId: string): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.getShiftCandidates({ sourceTeacherId: teacherId });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('getShiftCandidates', error);
    }
  }

  async shiftTeacherSchedule(
    teacherId: string,
    body: { targetTeacherId: string; reason?: string; shiftedBy?: string },
  ): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.shiftTeacherSchedule({
        sourceTeacherId: teacherId,
        targetTeacherId: body?.targetTeacherId,
        reason: body?.reason || '',
        shiftedBy: body?.shiftedBy || 'admin',
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('shiftTeacherSchedule', error);
    }
  }

  // ── Bookings ──────────────────────────────────────────────────────────────

  async listBookings(filters: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.listBookings(filters);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('listBookings', error);
    }
  }

  async createBooking(payload: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.createBooking(payload);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('createBooking', error);
    }
  }

  async updateBooking(id: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.updateBooking(id, body);
    } catch (error: unknown) {
      return this.throwMappedLegacyError('updateBooking', error);
    }
  }

  async deleteBooking(id: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const repo = this.schedulingRepository.getRepository();
      return await repo.updateBooking(id, {
        status: 'cancelled',
        adminNote: body?.adminNote || '',
      });
    } catch (error: unknown) {
      return this.throwMappedLegacyError('deleteBooking', error);
    }
  }
}
