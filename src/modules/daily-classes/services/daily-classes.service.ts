import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { DailyClassModelName } from '../entities/daily-class.entity';
import type { CreateDailyClassDto } from '../dto/create-daily-class.dto';
import type { RescheduleDailyClassDto } from '../dto/reschedule-daily-class.dto';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface DailyClassDoc {
  _id: string;
  classType?: string;
  status?: string;
  bookingId?: unknown;
  teacherId?: string;
  teacherUid?: string;
  teacherName?: string;
  teacherTimezone?: string;
  studentId?: string;
  studentName?: string;
  studentTimezone?: string;
  familyId?: string;
  startUtc?: Date;
  endUtc?: Date;
  durationMinutes?: number;
  adminDate?: string;
  adminStartTime?: string;
  adminEndTime?: string;
  teacherLocalDate?: string;
  teacherLocalStartTime?: string;
  teacherLocalEndTime?: string;
  studentLocalDate?: string;
  studentLocalStartTime?: string;
  activatedAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  onlineAt?: Date | null;
  rescheduledFromId?: string;
  rescheduledToId?: string;
  notes?: string;
  raw?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface ScheduleBookingDoc {
  _id: unknown;
  startUtc?: Date;
  endUtc?: Date;
  status?: string;
  classType?: string;
  teacherId?: string;
  teacherUid?: string;
  teacherName?: string;
  teacherTimezone?: string;
  studentId?: string;
  studentName?: string;
  studentTimezone?: string;
  familyId?: string;
  durationMinutes?: number;
  teacherLocalDate?: string;
  teacherLocalStartTime?: string;
  teacherLocalEndTime?: string;
  studentLocalDate?: string;
  studentLocalStartTime?: string;
  [key: string]: unknown;
}

interface FamilyDoc {
  _id: unknown;
  parentUid?: string;
  [key: string]: unknown;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function bookingToDailyClass(booking: ScheduleBookingDoc, businessTimezone: string): DailyClassDoc {
  const btz = businessTimezone || 'Asia/Riyadh';
  const start = DateTime.fromJSDate(new Date(booking.startUtc as Date)).setZone(btz);
  const end = DateTime.fromJSDate(new Date((booking.endUtc ?? booking.startUtc) as Date)).setZone(btz);

  return {
    _id: crypto.randomBytes(12).toString('hex'),
    classType: (booking.classType as string) || 'regular',
    status: 'scheduled',
    bookingId: booking._id,
    teacherId: booking.teacherId,
    teacherUid: booking.teacherUid,
    teacherName: booking.teacherName,
    teacherTimezone: booking.teacherTimezone,
    studentId: booking.studentId,
    studentName: booking.studentName,
    studentTimezone: booking.studentTimezone,
    familyId: booking.familyId,
    startUtc: booking.startUtc,
    endUtc: booking.endUtc,
    durationMinutes: booking.durationMinutes ?? 30,
    adminDate: start.toISODate() ?? undefined,
    adminStartTime: start.toFormat('HH:mm'),
    adminEndTime: end.toFormat('HH:mm'),
    teacherLocalDate: booking.teacherLocalDate,
    teacherLocalStartTime: booking.teacherLocalStartTime,
    teacherLocalEndTime: booking.teacherLocalEndTime,
    studentLocalDate: booking.studentLocalDate,
    studentLocalStartTime: booking.studentLocalStartTime,
    raw: { sourceBooking: booking },
  };
}

// Stub push notification — replace with real implementation when available
async function sendClassStartedPush(cls: DailyClassDoc): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[DailyClassesService] sendClassStartedPush', {
    classId: cls._id,
    teacherId: cls.teacherId,
    studentId: cls.studentId,
    familyId: cls.familyId,
    startUtc: cls.startUtc,
  });
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

@Injectable()
export class DailyClassesService {
  constructor(
    @InjectModel(DailyClassModelName)
    private readonly dailyClassModel: Model<DailyClassDoc>,

    @InjectModel('ScheduleBooking')
    private readonly scheduleBookingModel: Model<ScheduleBookingDoc>,

    @InjectModel('Family')
    private readonly familyModel: Model<FamilyDoc>,
  ) {}

  // -----------------------------------------------------------------------
  // 1. List daily classes
  // -----------------------------------------------------------------------

  async listClasses(
    query: Record<string, string | undefined>,
    user: RequestUser,
  ): Promise<{ success: true; classes: DailyClassDoc[] }> {
    try {
      const filter: Record<string, unknown> = {};

      if (query.date) filter.adminDate = query.date;
      if (query.status) filter.status = query.status;
      if (query.classType) filter.classType = query.classType;
      if (query.classTime) filter.adminStartTime = query.classTime;

      // Teachers can only see their own classes
      if (user.role === 'teacher') {
        filter.teacherId = user.uid;
      } else if (query.teacherId) {
        filter.teacherId = query.teacherId;
      }

      const classes = await this.dailyClassModel
        .find(filter)
        .sort({ startUtc: 1 })
        .lean<DailyClassDoc[]>();

      return { success: true, classes };
    } catch (err: unknown) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to list daily classes',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 2. Generate classes from ScheduleBookings for a date
  // -----------------------------------------------------------------------

  async generateClasses(
    date: string,
    businessTimezone?: string,
  ): Promise<{ success: true; created: number; skipped: number; total: number }> {
    if (!date) {
      throw new BadRequestException('date required (YYYY-MM-DD)');
    }

    try {
      const btz = businessTimezone || 'Asia/Riyadh';

      const dayStart = DateTime.fromISO(date, { zone: btz }).startOf('day').toUTC().toJSDate();
      const dayEnd = DateTime.fromISO(date, { zone: btz }).endOf('day').toUTC().toJSDate();

      const bookings = await this.scheduleBookingModel
        .find({
          startUtc: { $gte: dayStart, $lte: dayEnd },
          status: { $ne: 'cancelled' },
        })
        .lean<ScheduleBookingDoc[]>();

      let created = 0;
      let skipped = 0;

      for (const booking of bookings) {
        const exists = await this.dailyClassModel
          .findOne({ bookingId: booking._id, adminDate: date })
          .lean<DailyClassDoc>();

        if (exists) {
          skipped++;
          continue;
        }

        const doc = bookingToDailyClass(booking, btz);
        doc.adminDate = date;
        await this.dailyClassModel.create(doc);
        created++;
      }

      return { success: true, created, skipped, total: bookings.length };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to generate daily classes',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 3. Create manual class
  // -----------------------------------------------------------------------

  async createClass(
    body: CreateDailyClassDto,
  ): Promise<{ success: true; classId: string; entry: DailyClassDoc }> {
    try {
      const id = (body._id as string) || crypto.randomBytes(12).toString('hex');
      const doc = await this.dailyClassModel.create({ ...body, _id: id });
      return { success: true, classId: id, entry: doc.toObject() as DailyClassDoc };
    } catch (err: unknown) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to create daily class',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. General update
  // -----------------------------------------------------------------------

  async updateClass(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; entry: DailyClassDoc }> {
    try {
      const updated = await this.dailyClassModel
        .findByIdAndUpdate(id, { $set: body }, { new: true })
        .lean<DailyClassDoc>();

      if (!updated) {
        throw new NotFoundException('Daily class not found');
      }

      return { success: true, entry: updated };
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to update daily class',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 5. Status transition
  // -----------------------------------------------------------------------

  async updateStatus(
    id: string,
    status: string,
    user: RequestUser,
  ): Promise<{ success: true; class: DailyClassDoc }> {
    const allowed = [
      'scheduled', 'active', 'running', 'taken', 'advance',
      'absent', 'leave', 'rescheduled', 'cancelled',
    ];

    if (!allowed.includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    try {
      if (user.role === 'teacher') {
        const cls = await this.dailyClassModel.findById(id).lean<DailyClassDoc>();
        if (!cls) throw new NotFoundException('Daily class not found');

        if (String(cls.teacherId) !== String(user.uid)) {
          throw new ForbiddenException('You can only update your own classes');
        }

        const teacherAllowed = ['active', 'running', 'taken', 'advance', 'absent', 'leave'];
        if (!teacherAllowed.includes(status)) {
          throw new ForbiddenException(`Teachers cannot set status to '${status}'`);
        }
      }

      const update: Record<string, unknown> = { status };
      if (status === 'active') update.activatedAt = new Date();
      if (status === 'running') update.startedAt = new Date();
      if (status === 'taken') update.endedAt = new Date();

      const updated = await this.dailyClassModel
        .findByIdAndUpdate(id, { $set: update }, { new: true })
        .lean<DailyClassDoc>();

      if (!updated) throw new NotFoundException('Daily class not found');

      if (status === 'running') {
        sendClassStartedPush(updated).catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.warn('[DailyClassesService] Class-started push failed:', err instanceof Error ? err.message : err),
        );
      }

      return { success: true, class: updated };
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to update class status',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 6. My active class (parent / student polling)
  // -----------------------------------------------------------------------

  async getMyActiveClass(
    user: RequestUser,
  ): Promise<{ activeClass: DailyClassDoc | null }> {
    try {
      const uid = String(user.uid || '').trim();
      if (!uid) return { activeClass: null };

      const today = new Date().toISOString().split('T')[0];

      const families = await this.familyModel
        .find({ parentUid: uid })
        .lean<FamilyDoc[]>();
      const familyIds = families.map((f) => String(f._id));

      let cls: DailyClassDoc | null = null;

      if (familyIds.length > 0) {
        cls = await this.dailyClassModel
          .findOne({
            adminDate: today,
            status: 'running',
            familyId: { $in: familyIds },
          })
          .lean<DailyClassDoc>();
      }

      if (!cls) {
        cls = await this.dailyClassModel
          .findOne({
            adminDate: today,
            status: 'running',
            $or: [{ studentId: uid }, { familyId: uid }],
          })
          .lean<DailyClassDoc>();
      }

      return { activeClass: cls ?? null };
    } catch (err: unknown) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to get active class',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 7. Reschedule
  // -----------------------------------------------------------------------

  async rescheduleClass(
    id: string,
    dto: RescheduleDailyClassDto,
  ): Promise<{ success: true; newClassId: string; entry: DailyClassDoc }> {
    const { newDate, newStartTime, businessTimezone } = dto;

    if (!newDate || !newStartTime) {
      throw new BadRequestException('newDate and newStartTime required');
    }

    try {
      const original = await this.dailyClassModel.findById(id).lean<DailyClassDoc>();
      if (!original) throw new NotFoundException('Daily class not found');

      const btz = businessTimezone || 'Asia/Riyadh';
      const newStart = DateTime.fromISO(`${newDate}T${newStartTime}`, { zone: btz })
        .toUTC()
        .toJSDate();
      const newEnd = new Date(newStart.getTime() + ((original.durationMinutes ?? 30) * 60000));

      // Check teacher conflict at new time
      const conflict = await this.dailyClassModel
        .findOne({
          teacherId: original.teacherId,
          adminDate: newDate,
          adminStartTime: newStartTime,
          status: { $nin: ['cancelled', 'rescheduled'] },
          _id: { $ne: original._id },
        })
        .lean<DailyClassDoc>();

      if (conflict) {
        throw new ConflictException('Teacher has a class at that time');
      }

      const newId = crypto.randomBytes(12).toString('hex');
      const newStartDt = DateTime.fromJSDate(newStart).setZone(btz);
      const newEndDt = DateTime.fromJSDate(newEnd).setZone(btz);

      const teacherTz = original.teacherTimezone || btz;
      const studentTz = original.studentTimezone || btz;
      const newStartTeacher = DateTime.fromJSDate(newStart).setZone(teacherTz);
      const newEndTeacher = DateTime.fromJSDate(newEnd).setZone(teacherTz);
      const newStartStudent = DateTime.fromJSDate(newStart).setZone(studentTz);

      // Spread original fields, then override with new times
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id: _discardId, createdAt: _discardCreatedAt, updatedAt: _discardUpdatedAt, ...originalRest } = original;

      await this.dailyClassModel.create({
        ...originalRest,
        _id: newId,
        status: 'scheduled',
        classType: 'reschedule',
        rescheduledFromId: original._id,
        rescheduledToId: undefined,
        startUtc: newStart,
        endUtc: newEnd,
        adminDate: newDate,
        adminStartTime: newStartDt.toFormat('HH:mm'),
        adminEndTime: newEndDt.toFormat('HH:mm'),
        teacherLocalDate: newStartTeacher.toFormat('yyyy-MM-dd'),
        teacherLocalStartTime: newStartTeacher.toFormat('HH:mm'),
        teacherLocalEndTime: newEndTeacher.toFormat('HH:mm'),
        studentLocalDate: newStartStudent.toFormat('yyyy-MM-dd'),
        studentLocalStartTime: newStartStudent.toFormat('HH:mm'),
        activatedAt: null,
        startedAt: null,
        endedAt: null,
        onlineAt: null,
      });

      await this.dailyClassModel.findByIdAndUpdate(original._id, {
        $set: { status: 'rescheduled', rescheduledToId: newId },
      });

      const created = await this.dailyClassModel.findById(newId).lean<DailyClassDoc>();
      return { success: true, newClassId: newId, entry: created! };
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to reschedule class',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 8. Test utility: create a now-class
  // -----------------------------------------------------------------------

  async createNowClass(body: {
    teacherId: string;
    teacherUid?: string;
    teacherName?: string;
    studentId: string;
    studentName?: string;
    familyId?: string;
    teacherTimezone?: string;
    studentTimezone?: string;
    durationMinutes?: number;
  }): Promise<{ success: true; classId: string; class: DailyClassDoc }> {
    const {
      teacherId,
      teacherUid,
      teacherName,
      studentId,
      studentName,
      familyId,
      teacherTimezone = 'Asia/Karachi',
      studentTimezone = 'Asia/Karachi',
      durationMinutes = 30,
    } = body;

    if (!teacherId || !studentId) {
      throw new BadRequestException('teacherId and studentId are required');
    }

    try {
      const now = new Date();
      const startUtc = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago
      const endUtc = new Date(startUtc.getTime() + durationMinutes * 60 * 1000);
      const btz = 'Asia/Riyadh';

      const adminStart = DateTime.fromJSDate(startUtc).setZone(btz);
      const adminEnd = DateTime.fromJSDate(endUtc).setZone(btz);
      const teacherStart = DateTime.fromJSDate(startUtc).setZone(teacherTimezone);
      const teacherEnd = DateTime.fromJSDate(endUtc).setZone(teacherTimezone);
      const studentStart = DateTime.fromJSDate(startUtc).setZone(studentTimezone);

      const id = crypto.randomBytes(12).toString('hex');

      const doc = await this.dailyClassModel.create({
        _id: id,
        classType: 'temporary',
        status: 'scheduled',
        teacherId,
        teacherUid: teacherUid ?? teacherId,
        teacherName: teacherName ?? 'Teacher',
        teacherTimezone,
        studentId,
        studentName: studentName ?? 'Student',
        familyId: familyId ?? '',
        studentTimezone,
        startUtc,
        endUtc,
        durationMinutes,
        adminDate: adminStart.toISODate(),
        adminStartTime: adminStart.toFormat('HH:mm'),
        adminEndTime: adminEnd.toFormat('HH:mm'),
        teacherLocalDate: teacherStart.toISODate(),
        teacherLocalStartTime: teacherStart.toFormat('HH:mm'),
        teacherLocalEndTime: teacherEnd.toFormat('HH:mm'),
        studentLocalDate: studentStart.toISODate(),
        studentLocalStartTime: studentStart.toFormat('HH:mm'),
        notes: '[TEST CLASS - created by /api/test/create-now-class]',
      });

      return { success: true, classId: id, class: doc.toObject() as DailyClassDoc };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to create test class',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 9. Test utility: cleanup test classes
  // -----------------------------------------------------------------------

  async cleanupTestClasses(
    teacherId?: string,
  ): Promise<{ success: true; deleted: number }> {
    try {
      const filter: Record<string, unknown> = { notes: /\[TEST CLASS/ };
      if (teacherId) filter.teacherId = teacherId;

      const result = await this.dailyClassModel.deleteMany(filter);
      return { success: true, deleted: result.deletedCount ?? 0 };
    } catch (err: unknown) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to cleanup test classes',
      );
    }
  }
}
