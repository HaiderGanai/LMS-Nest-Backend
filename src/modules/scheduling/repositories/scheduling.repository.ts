import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface SchedulingLegacyModule {
  assignTeacherSchedule: (payload: unknown) => Promise<unknown>;
  createBooking: (payload: unknown) => Promise<unknown>;
  getShiftCandidates: (payload: unknown) => Promise<unknown>;
  listBookings: (payload: unknown) => Promise<unknown>;
  listTeacherAvailability: (payload: unknown) => Promise<unknown>;
  deleteTeacherAvailabilityBreak: (payload: unknown) => Promise<unknown>;
  searchAvailableTeachers: (payload: unknown) => Promise<unknown>;
  shiftTeacherSchedule: (payload: unknown) => Promise<unknown>;
  unassignTeacherSchedule: (payload: unknown) => Promise<unknown>;
  updateBooking: (bookingId: string, payload: unknown) => Promise<unknown>;
  upsertTeacherAvailability: (payload: unknown) => Promise<unknown>;
}

interface LegacyDbModule {
  connectMongo: () => Promise<unknown>;
}

@Injectable()
export class SchedulingRepository {
  private readonly legacyDbModule: LegacyDbModule = requireLegacyModule<LegacyDbModule>('src/legacy/db.js');
  private readonly schedulingLegacyModule: SchedulingLegacyModule = requireLegacyModule<SchedulingLegacyModule>('src/legacy/utils/schedulingService.js');
  private readonly legacyMongoReady: Promise<unknown> = this.legacyDbModule.connectMongo();

  private async ensureLegacyMongoConnected(): Promise<void> {
    await this.legacyMongoReady;
  }

  private readonly repositoryProxy: SchedulingLegacyModule = {
    assignTeacherSchedule: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.assignTeacherSchedule(payload);
    },
    createBooking: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.createBooking(payload);
    },
    getShiftCandidates: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.getShiftCandidates(payload);
    },
    listBookings: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.listBookings(payload);
    },
    listTeacherAvailability: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.listTeacherAvailability(payload);
    },
    deleteTeacherAvailabilityBreak: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.deleteTeacherAvailabilityBreak(payload);
    },
    searchAvailableTeachers: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.searchAvailableTeachers(payload);
    },
    shiftTeacherSchedule: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.shiftTeacherSchedule(payload);
    },
    unassignTeacherSchedule: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.unassignTeacherSchedule(payload);
    },
    updateBooking: async (bookingId: string, payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.updateBooking(bookingId, payload);
    },
    upsertTeacherAvailability: async (payload: unknown) => {
      await this.ensureLegacyMongoConnected();
      return this.schedulingLegacyModule.upsertTeacherAvailability(payload);
    },
  };

  getRepository(): SchedulingLegacyModule {
    return this.repositoryProxy;
  }
}
