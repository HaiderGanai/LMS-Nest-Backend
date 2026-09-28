const crypto = require('crypto');
const { DateTime } = require('luxon');
const MongoEmployee = require('../models/Employee');
const MongoFamily = require('../models/Family');
const MongoFamilyMember = require('../models/FamilyMember');
const MongoScheduleAvailability = require('../models/ScheduleAvailability');
const MongoScheduleAssignmentRequest = require('../models/ScheduleAssignmentRequest');
const MongoScheduleBooking = require('../models/ScheduleBooking');
const MongoStudent = require('../models/Student');
const MongoUser = require('../models/User');
const {
  DEFAULT_SLOT_MINUTES,
  buildBusinessSnapshot,
  buildLocalSnapshot,
  buildUtcSlotFromStudentInput,
  createLocalDateTime,
  doesUtcSlotFitIntervals,
  doesUtcSlotOverlapIntervals,
  expandIntervalsFromRanges,
  getTeacherCandidateDateKeys,
  normalizeDateKey,
  normalizeTimeString,
  normalizeTimezone,
  normalizeWeekday,
  weekdayIndexToName,
} = require('./scheduling');

const DEFAULT_TEACHER_TIMEZONE = 'Asia/Karachi';
const DEFAULT_BUSINESS_TIMEZONE = normalizeTimezone(process.env.SCHEDULING_BUSINESS_TIMEZONE || 'Asia/Karachi', 'Asia/Karachi');
const ACTIVE_BOOKING_STATUSES = ['booked', 'confirmed', 'needs_review'];

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildId() {
  return crypto.randomBytes(12).toString('hex');
}

function buildRangeId(prefix) {
  return `${prefix}_${buildId()}`;
}

function buildHistoryId(prefix = 'history') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickFirstString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function parseTimeToMinutes(value) {
  const normalized = normalizeTimeString(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function resolveDurationMinutes({
  studentTime,
  studentEndTime = '',
  durationMinutes = DEFAULT_SLOT_MINUTES,
}) {
  const startMinutes = parseTimeToMinutes(studentTime);
  if (startMinutes === null) {
    throw new Error('studentTime must be a valid HH:mm value.');
  }

  const endMinutes = parseTimeToMinutes(studentEndTime);
  if (endMinutes !== null) {
    const computed = endMinutes - startMinutes;
    if (computed <= 0) {
      throw new Error('studentEndTime must be after studentTime.');
    }
    if (computed % DEFAULT_SLOT_MINUTES !== 0) {
      throw new Error(`Duration must be in ${DEFAULT_SLOT_MINUTES}-minute increments.`);
    }
    return computed;
  }

  const normalizedDuration = Number(durationMinutes || DEFAULT_SLOT_MINUTES);
  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
    throw new Error('durationMinutes must be greater than zero.');
  }
  if (normalizedDuration % DEFAULT_SLOT_MINUTES !== 0) {
    throw new Error(`Duration must be in ${DEFAULT_SLOT_MINUTES}-minute increments.`);
  }
  return normalizedDuration;
}

function shapeTeacherDoc(doc, userDoc = null) {
  if (!doc && !userDoc) return null;

  const source = doc || userDoc;
  const raw = source?.raw && typeof source.raw === 'object' ? source.raw : {};
  const canonicalId = pickFirstString(doc?.uid, doc?._id, userDoc?.uid, userDoc?._id);
  const employeeId = pickFirstString(doc?._id, doc?.uid, canonicalId);
  const userId = pickFirstString(userDoc?._id, userDoc?.uid, doc?.uid, canonicalId);

  return {
    canonicalId,
    employeeId,
    uid: canonicalId,
    userId,
    name: pickFirstString(doc?.name, userDoc?.name, raw.name, doc?.email, userDoc?.email, canonicalId),
    email: pickFirstString(doc?.email, userDoc?.email, raw.email),
    timezone: normalizeTimezone(
      pickFirstString(doc?.timezone, raw.timezone, userDoc?.timezone, userDoc?.raw?.timezone),
      DEFAULT_TEACHER_TIMEZONE
    ),
    gender: pickFirstString(doc?.gender, raw.gender, userDoc?.gender, userDoc?.raw?.gender),
    nationality: pickFirstString(doc?.nationality, raw.nationality, userDoc?.nationality, userDoc?.raw?.nationality),
    category: pickFirstString(doc?.category, raw.category, userDoc?.category, userDoc?.raw?.category),
    status: pickFirstString(doc?.status, raw.status, userDoc?.status, userDoc?.raw?.status),
    scheduleLocked: Boolean(doc?.scheduleLocked || raw.scheduleLocked || userDoc?.scheduleLocked || userDoc?.raw?.scheduleLocked),
    scheduleLockReason: pickFirstString(doc?.scheduleLockReason, raw.scheduleLockReason, userDoc?.scheduleLockReason, userDoc?.raw?.scheduleLockReason),
    scheduledHours: Array.isArray(doc?.scheduledHours)
      ? doc.scheduledHours
      : (Array.isArray(raw.scheduledHours) ? raw.scheduledHours : (Array.isArray(userDoc?.raw?.scheduledHours) ? userDoc.raw.scheduledHours : [])),
    raw,
  };
}

function teacherMatchesFilters(teacher, filters = {}) {
  const checks = [
    ['gender', teacher.gender],
    ['nationality', teacher.nationality],
    ['category', teacher.category],
  ];

  return checks.every(([key, teacherValue]) => {
    const requested = String(filters[key] || '').trim().toLowerCase();
    if (!requested) return true;
    return String(teacherValue || '').trim().toLowerCase() === requested;
  });
}

async function resolveTeacherRecord(teacherId) {
  const requestedTeacherId = String(teacherId || '').trim();
  if (!requestedTeacherId) {
    throw new Error('teacherId is required.');
  }

  const escaped = escapeRegExp(requestedTeacherId);
  const employeeDoc = await MongoEmployee.findOne({
    designation: 'teacher',
    $or: [
      { _id: requestedTeacherId },
      { uid: requestedTeacherId },
      { email: { $regex: `^${escaped}$`, $options: 'i' } },
    ],
  }).lean();

  let userDoc = null;
  if (employeeDoc) {
    const employeeEmail = pickFirstString(employeeDoc.email);
    const emailRegex = employeeEmail ? { email: { $regex: `^${escapeRegExp(employeeEmail)}$`, $options: 'i' } } : null;
    userDoc = await MongoUser.findOne({
      role: 'teacher',
      $or: [
        { _id: employeeDoc.uid || employeeDoc._id },
        { uid: employeeDoc.uid || employeeDoc._id },
        ...(emailRegex ? [emailRegex] : []),
      ],
    }).lean();
  }

  if (!employeeDoc && !userDoc) {
    userDoc = await MongoUser.findOne({
      role: 'teacher',
      $or: [
        { _id: requestedTeacherId },
        { uid: requestedTeacherId },
        { email: { $regex: `^${escaped}$`, $options: 'i' } },
      ],
    }).lean();
  }

  const teacher = shapeTeacherDoc(employeeDoc, userDoc);
  if (!teacher?.canonicalId) {
    throw new Error('Teacher not found.');
  }

  return teacher;
}

async function listSearchableTeachers(filters = {}) {
  const employeeDocs = await MongoEmployee.find({
    designation: 'teacher',
    isActive: { $ne: false },
    $or: [
      { status: { $in: ['active', 'on_training', ''] } },
      { status: { $exists: false } },
    ],
  }).lean();

  return employeeDocs
    .map((doc) => shapeTeacherDoc(doc))
    .filter((teacher) => teacher?.canonicalId)
    .filter((teacher) => !teacher.scheduleLocked)
    .filter((teacher) => teacherMatchesFilters(teacher, filters));
}

function normalizeStoredRanges(ranges, dateKey, timezone, prefix) {
  const normalizedDateKey = normalizeDateKey(dateKey);
  if (!normalizedDateKey) {
    throw new Error('A valid teacher local date is required.');
  }

  return (Array.isArray(ranges) ? ranges : []).map((range) => {
    const startTime = normalizeTimeString(range?.startTime || range?.from || range?.start);
    const endTime = normalizeTimeString(range?.endTime || range?.to || range?.end);
    if (!startTime || !endTime) {
      throw new Error('Availability ranges must include valid startTime and endTime values.');
    }

    const start = createLocalDateTime(normalizedDateKey, startTime, timezone);
    const endDayOffset = Number.isInteger(range?.endDayOffset)
      ? range.endDayOffset
      : (endTime <= startTime ? 1 : 0);
    const endDateKey = DateTime.fromISO(normalizedDateKey, { zone: 'utc' }).plus({ days: endDayOffset }).toISODate();
    const end = createLocalDateTime(endDateKey, endTime, timezone);
    if (end <= start) {
      throw new Error('Availability range end must be after start.');
    }

    return {
      id: pickFirstString(range?.id) || buildRangeId(prefix),
      startTime,
      endTime,
      endDayOffset,
      note: pickFirstString(range?.note, range?.description),
    };
  });
}

function buildDateRange(dateFrom, dateTo) {
  const startKey = normalizeDateKey(dateFrom);
  const endKey = normalizeDateKey(dateTo);
  if (!startKey || !endKey) {
    throw new Error('dateFrom and dateTo must be valid YYYY-MM-DD values.');
  }

  let cursor = DateTime.fromISO(startKey, { zone: 'utc' });
  const end = DateTime.fromISO(endKey, { zone: 'utc' });
  if (end < cursor) {
    throw new Error('dateTo must be greater than or equal to dateFrom.');
  }

  const dates = [];
  while (cursor <= end) {
    dates.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
  }
  return dates;
}

function normalizeRequestedWeekdays(values = []) {
  const rawValues = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const weekdays = [];

  rawValues.forEach((value) => {
    const normalized = normalizeWeekday(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    weekdays.push(normalized);
  });

  return weekdays;
}

function buildRequestedStudentSlots({
  studentDate,
  studentTime,
  studentTimezone,
  durationMinutes,
  requiredDays = [],
}) {
  const effectiveTimezone = normalizeTimezone(studentTimezone, 'UTC');
  const normalizedAnchorDate = normalizeDateKey(studentDate) || DateTime.now().setZone(effectiveTimezone).toISODate();
  const anchor = DateTime.fromISO(normalizedAnchorDate, { zone: effectiveTimezone }).startOf('day');
  const requestedWeekdays = normalizeRequestedWeekdays(requiredDays);

  if (requestedWeekdays.length === 0) {
    const slot = buildUtcSlotFromStudentInput({
      studentDate: normalizedAnchorDate,
      studentTime,
      studentTimezone: effectiveTimezone,
      durationMinutes,
    });

    return [{
      weekday: slot.studentLocalStart.weekday,
      weekdayName: weekdayIndexToName(slot.studentLocalStart.weekday),
      studentDate: normalizedAnchorDate,
      ...slot,
    }];
  }

  return requestedWeekdays.map((weekday) => {
    const delta = (weekday - anchor.weekday + 7) % 7;
    const nextStudentDate = anchor.plus({ days: delta }).toISODate();
    const slot = buildUtcSlotFromStudentInput({
      studentDate: nextStudentDate,
      studentTime,
      studentTimezone: effectiveTimezone,
      durationMinutes,
    });

    return {
      weekday,
      weekdayName: weekdayIndexToName(weekday),
      studentDate: nextStudentDate,
      ...slot,
    };
  });
}

function getTemplateIntervalsForDate(teacher, dateKey) {
  const weekday = DateTime.fromISO(dateKey, { zone: 'utc' }).weekday;
  const matchingEntries = (Array.isArray(teacher.scheduledHours) ? teacher.scheduledHours : [])
    .filter((entry) => normalizeWeekday(entry?.day) === weekday);

  return expandIntervalsFromRanges(matchingEntries, dateKey, teacher.timezone);
}

function buildAvailabilityMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    if (!doc?.teacherId || !doc?.date) continue;
    map.set(`${doc.teacherId}::${doc.date}`, doc);
  }
  return map;
}

function doesBookingOverlapSlot(booking, slotStartUtc, slotEndUtc) {
  const bookingStart = DateTime.fromJSDate(new Date(booking.startUtc), { zone: 'utc' });
  const bookingEnd = DateTime.fromJSDate(new Date(booking.endUtc), { zone: 'utc' });
  if (!bookingStart.isValid || !bookingEnd.isValid) return false;
  return bookingStart < slotEndUtc && bookingEnd > slotStartUtc;
}

function findTeacherAvailabilityForSlot({
  teacher,
  availabilityMap,
  slotStartUtc,
  slotEndUtc,
}) {
  const candidateDates = getTeacherCandidateDateKeys(slotStartUtc, teacher.timezone);
  for (const dateKey of candidateDates) {
    const explicit = availabilityMap.get(`${teacher.canonicalId}::${dateKey}`);
    if (explicit) {
      const explicitRanges = expandIntervalsFromRanges(explicit.ranges, dateKey, teacher.timezone);
      const explicitBreaks = expandIntervalsFromRanges(explicit.breaks, dateKey, teacher.timezone);
      if (
        explicitRanges.length > 0 &&
        doesUtcSlotFitIntervals(slotStartUtc, slotEndUtc, explicitRanges) &&
        !doesUtcSlotOverlapIntervals(slotStartUtc, slotEndUtc, explicitBreaks)
      ) {
        return {
          source: 'daily_override',
          dateKey,
          note: pickFirstString(explicit.notes),
        };
      }
      continue;
    }

    const templateIntervals = getTemplateIntervalsForDate(teacher, dateKey);
    if (templateIntervals.length > 0 && doesUtcSlotFitIntervals(slotStartUtc, slotEndUtc, templateIntervals)) {
      return {
        source: 'weekly_template',
        dateKey,
        note: '',
      };
    }
  }

  return null;
}

async function findTeacherAvailabilityForSpecificSlot(teacher, slotStartUtc, slotEndUtc) {
  const candidateDates = uniq(getTeacherCandidateDateKeys(slotStartUtc, teacher.timezone));
  const availabilityDocs = candidateDates.length > 0
    ? await MongoScheduleAvailability.find({
      teacherId: teacher.canonicalId,
      date: { $in: candidateDates },
    }).lean()
    : [];

  return findTeacherAvailabilityForSlot({
    teacher,
    availabilityMap: buildAvailabilityMap(availabilityDocs),
    slotStartUtc,
    slotEndUtc,
  });
}

async function searchAvailableTeachers({
  studentDate,
  studentTime,
  studentTimezone,
  durationMinutes = DEFAULT_SLOT_MINUTES,
  requiredDays = [],
  filters = {},
  includeUnavailable = false,
  excludeBookingId = null,
}) {
  const requestedSlots = buildRequestedStudentSlots({
    studentDate,
    studentTime,
    studentTimezone,
    durationMinutes,
    requiredDays,
  });
  const earliestSlotStart = requestedSlots.reduce(
    (current, entry) => (entry.startUtc < current ? entry.startUtc : current),
    requestedSlots[0].startUtc
  );
  const latestSlotEnd = requestedSlots.reduce(
    (current, entry) => (entry.endUtc > current ? entry.endUtc : current),
    requestedSlots[0].endUtc
  );

  const teachers = await listSearchableTeachers(filters);
  const teacherIds = uniq(teachers.map((teacher) => teacher.canonicalId));
  const availabilityDates = uniq(
    teachers.flatMap((teacher) => requestedSlots.flatMap((slot) => getTeacherCandidateDateKeys(slot.startUtc, teacher.timezone)))
  );

  const [availabilityDocs, overlappingBookings] = await Promise.all([
    teacherIds.length > 0
      ? MongoScheduleAvailability.find({ teacherId: { $in: teacherIds }, date: { $in: availabilityDates } }).lean()
      : Promise.resolve([]),
    teacherIds.length > 0
      ? MongoScheduleBooking.find({
        status: { $in: ACTIVE_BOOKING_STATUSES },
        $or: [
          { teacherId: { $in: teacherIds } },
          { teacherUid: { $in: teacherIds } },
        ],
        ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
        startUtc: { $lt: latestSlotEnd.toJSDate() },
        endUtc: { $gt: earliestSlotStart.toJSDate() },
      }).lean()
      : Promise.resolve([]),
  ]);

  const availabilityMap = buildAvailabilityMap(availabilityDocs);
  const matches = [];
  const unavailable = [];

  for (const teacher of teachers) {
    const matchedDays = [];
    let unavailableReason = '';

    for (const requestedSlot of requestedSlots) {
      const availability = findTeacherAvailabilityForSlot({
        teacher,
        availabilityMap,
        slotStartUtc: requestedSlot.startUtc,
        slotEndUtc: requestedSlot.endUtc,
      });

      if (!availability) {
        unavailableReason = 'outside_availability';
        break;
      }

      const hasConflict = overlappingBookings.some((booking) => (
        [booking.teacherId, booking.teacherUid].filter(Boolean).includes(teacher.canonicalId)
        && doesBookingOverlapSlot(booking, requestedSlot.startUtc, requestedSlot.endUtc)
      ));

      if (hasConflict) {
        unavailableReason = 'slot_conflict';
        break;
      }

      matchedDays.push({
        requestedWeekday: requestedSlot.weekdayName,
        studentLocal: buildLocalSnapshot(requestedSlot.startUtc, normalizeTimezone(studentTimezone)),
        teacherLocal: buildLocalSnapshot(requestedSlot.startUtc, teacher.timezone),
        availabilitySource: availability.source,
        availabilityDate: availability.dateKey,
        availabilityNote: availability.note,
      });
    }

    if (matchedDays.length === requestedSlots.length) {
      const firstMatchedDay = matchedDays[0];
      const availabilitySources = uniq(matchedDays.map((item) => item.availabilitySource));
      matches.push({
        teacherId: teacher.canonicalId,
        teacherUid: teacher.uid,
        teacherEmployeeId: teacher.employeeId,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        teacherTimezone: teacher.timezone,
        teacherGender: teacher.gender,
        teacherNationality: teacher.nationality,
        teacherCategory: teacher.category,
        durationMinutes,
        slotStartUtc: requestedSlots[0].startUtc.toISO({ suppressMilliseconds: true }),
        slotEndUtc: requestedSlots[0].endUtc.toISO({ suppressMilliseconds: true }),
        studentLocal: firstMatchedDay?.studentLocal || null,
        teacherLocal: firstMatchedDay?.teacherLocal || null,
        availabilitySource: availabilitySources.length === 1 ? availabilitySources[0] : 'mixed',
        availabilityDate: firstMatchedDay?.availabilityDate || '',
        availabilityNote: firstMatchedDay?.availabilityNote || '',
        requiredDays: matchedDays.map((item) => item.requestedWeekday),
        matchedDays,
      });
      continue;
    }

    if (includeUnavailable) {
      unavailable.push({
        teacherId: teacher.canonicalId,
        teacherName: teacher.name,
        teacherTimezone: teacher.timezone,
        reason: unavailableReason || 'outside_availability',
      });
    }
  }

  return {
    success: true,
    slot: {
      durationMinutes,
      slotStartUtc: requestedSlots[0].startUtc.toISO({ suppressMilliseconds: true }),
      slotEndUtc: requestedSlots[0].endUtc.toISO({ suppressMilliseconds: true }),
      studentLocal: buildLocalSnapshot(requestedSlots[0].startUtc, normalizeTimezone(studentTimezone)),
      requiredDays: requestedSlots.map((slot) => slot.weekdayName),
    },
    teachers: matches,
    unavailable,
  };
}

async function resolveFamilyMemberContext(familyId, familyMemberId) {
  const normalizedFamilyId = String(familyId || '').trim();
  const normalizedMemberId = String(familyMemberId || '').trim();
  if (!normalizedFamilyId || !normalizedMemberId) {
    throw new Error('familyId and familyMemberId are required.');
  }

  const family = await MongoFamily.findById(normalizedFamilyId).lean();
  if (!family) {
    throw new Error('Family not found.');
  }

  // Prefer direct member document id, but support legacy callers that pass studentId/uid.
  let member = await MongoFamilyMember.findOne({
    _id: normalizedMemberId,
    familyId: normalizedFamilyId,
  }).lean();
  if (!member) {
    member = await MongoFamilyMember.findOne({
      familyId: normalizedFamilyId,
      $or: [
        { uid: normalizedMemberId },
        { studentId: normalizedMemberId },
        { 'raw.uid': normalizedMemberId },
        { 'raw.studentId': normalizedMemberId },
      ],
    }).lean();
  }

  if (!member) {
    throw new Error('Family member not found for provided familyMemberId.');
  }

  const identifiers = uniq([
    member.uid,
    member.studentId,
    member._id,
  ]);

  let studentDoc = null;
  if (identifiers.length > 0) {
    studentDoc = await MongoStudent.findOne({
      $or: [
        { _id: { $in: identifiers } },
        { studentId: { $in: identifiers } },
      ],
    }).lean();
  }

  return {
    family,
    member,
    studentDoc,
    studentId: pickFirstString(studentDoc?._id, member.uid, member.studentId),
    studentName: pickFirstString(member.name, member.raw?.name, studentDoc?.name, member.studentId, member._id),
  };
}

async function getCurrentTeacherAssignmentSummary(context, excludeBookingId = null) {
  if (!context?.member?._id) {
    return null;
  }

  const activeBookings = await MongoScheduleBooking.find({
    familyMemberId: context.member._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  })
    .sort({ startUtc: 1, createdAt: 1 })
    .lean();

  const storedTeacherIds = uniq([
    pickFirstString(context?.member?.assignedTeacher),
    pickFirstString(context?.member?.raw?.assignedTeacher),
    pickFirstString(context?.member?.raw?.teacherId),
    pickFirstString(context?.studentDoc?.assignedTeacher),
    pickFirstString(context?.studentDoc?.teacherId),
    pickFirstString(context?.studentDoc?.raw?.assignedTeacher),
    pickFirstString(context?.studentDoc?.raw?.teacherId),
  ]);

  const activeBookingTeacherIds = uniq(
    activeBookings.map((booking) => pickFirstString(
      booking?.teacherId,
      booking?.teacherUid,
      booking?.teacherEmployeeId,
    ))
  );

  const preferredTeacherId = pickFirstString(activeBookingTeacherIds[0], storedTeacherIds[0]);
  if (!preferredTeacherId) {
    return null;
  }

  const assignedTeacherName = pickFirstString(
    context?.member?.assignedTeacherName,
    context?.member?.raw?.assignedTeacherName,
    context?.studentDoc?.assignedTeacherName,
    context?.studentDoc?.raw?.assignedTeacherName,
  );

  const resolvedTeacher = await resolveTeacherRecord(preferredTeacherId).catch(() => null);

  return {
    type: 'student_already_assigned',
    studentName: context?.studentName || 'Student',
    assignedTeacherId: pickFirstString(resolvedTeacher?.canonicalId, preferredTeacherId),
    assignedTeacherName: pickFirstString(resolvedTeacher?.name, assignedTeacherName, preferredTeacherId),
    teacherIds: uniq([
      preferredTeacherId,
      ...storedTeacherIds,
      ...activeBookingTeacherIds,
      pickFirstString(resolvedTeacher?.canonicalId),
      pickFirstString(resolvedTeacher?.employeeId),
      pickFirstString(resolvedTeacher?.userId),
      pickFirstString(resolvedTeacher?.uid),
    ]),
    activeBookingCount: activeBookings.length,
    activeBookingIds: activeBookings
      .map((booking) => pickFirstString(booking?._id, booking?.id))
      .filter(Boolean),
    source: activeBookings.length > 0 ? 'active_bookings' : 'stored_assignment',
  };
}

async function syncTeacherAssignment({
  family,
  member,
  studentDoc,
  studentId,
  teacher,
  studentTimezone,
}) {
  const assignedTeacher = teacher?.canonicalId || null;
  const assignedTeacherName = teacher?.name || null;
  const timezone = normalizeTimezone(
    pickFirstString(studentTimezone, member?.timezone, member?.raw?.timezone, family?.timezone, family?.raw?.timezone),
    'UTC'
  );

  await MongoFamilyMember.updateOne(
    { _id: member._id },
    {
      $set: {
        assignedTeacher,
        assignedTeacherName,
        'raw.assignedTeacher': assignedTeacher,
        'raw.teacherId': assignedTeacher,
        'raw.timezone': timezone,
        'raw.assignedTeacherName': assignedTeacherName,
      },
    }
  );

  const normalizedStudentId = pickFirstString(studentDoc?._id, studentId);
  if (normalizedStudentId) {
    await MongoStudent.updateOne(
      { _id: normalizedStudentId },
      {
        $set: {
          teacherId: assignedTeacher,
          assignedTeacher,
          'raw.assignedTeacher': assignedTeacher,
          'raw.teacherId': assignedTeacher,
          'raw.timezone': timezone,
        },
      },
      { upsert: false }
    );

    await MongoUser.updateOne(
      {
        _id: normalizedStudentId,
        role: 'student',
      },
      {
        $set: {
          assignedTeacher,
          assignedTeacherName,
          teacherId: assignedTeacher,
          'raw.assignedTeacher': assignedTeacher,
          'raw.teacherId': assignedTeacher,
          'raw.assignedTeacherName': assignedTeacherName,
          'raw.timezone': timezone,
        },
      },
      { upsert: false }
    );
  }

  if (family?.parentUid) {
    const parentDoc = await MongoUser.findById(family.parentUid).lean();
    if (parentDoc && Array.isArray(parentDoc.children)) {
      const studentKeys = new Set(uniq([normalizedStudentId, member.studentId, member.uid]));
      const updatedChildren = parentDoc.children.map((child) => {
        const childStudentId = String(child?.studentId || '').trim();
        if (!studentKeys.has(childStudentId)) return child;
        return {
          ...child,
          assignedTeacher,
          assignedTeacherName,
        };
      });
      await MongoUser.updateOne(
        { _id: family.parentUid },
        { $set: { children: updatedChildren, lastActivity: new Date() } }
      );
    }
  }
}

async function appendTeacherAssignmentHistory({
  context,
  currentAssignment,
  cancelledBookingIds = [],
  cancelledRequestIds = [],
  note = '',
  changedBy = 'admin',
}) {
  if (!context?.member?._id || !currentAssignment?.assignedTeacherId) {
    return null;
  }

  const changedAt = new Date().toISOString();
  const historyEntry = {
    id: buildHistoryId('teacher_assignment'),
    action: 'unassigned',
    changedAt,
    changedBy: String(changedBy || 'admin').trim() || 'admin',
    note: String(note || '').trim(),
    teacherId: currentAssignment.assignedTeacherId,
    teacherName: currentAssignment.assignedTeacherName || currentAssignment.assignedTeacherId,
    studentId: context.studentId || null,
    studentName: context.studentName || null,
    familyId: context.family?._id || null,
    familyMemberId: context.member._id,
    source: currentAssignment.source || 'stored_assignment',
    activeBookingCount: Number(currentAssignment.activeBookingCount || 0),
    activeBookingIds: Array.isArray(currentAssignment.activeBookingIds) ? currentAssignment.activeBookingIds : [],
    cancelledBookingCount: cancelledBookingIds.length,
    cancelledBookingIds,
    cancelledRequestIds,
  };

  await MongoFamilyMember.updateOne(
    { _id: context.member._id },
    { $push: { 'raw.assignmentHistory': historyEntry } }
  );

  if (context.studentId) {
    await Promise.all([
      MongoStudent.updateOne(
        { _id: context.studentId },
        { $push: { 'raw.assignmentHistory': historyEntry } },
        { upsert: false }
      ),
      MongoUser.updateOne(
        { _id: context.studentId, role: 'student' },
        { $push: { 'raw.assignmentHistory': historyEntry } },
        { upsert: false }
      ),
    ]);
  }

  return historyEntry;
}

async function reconcileTeacherAssignmentForContext(context, excludeBookingId = null) {
  if (!context?.member?._id) {
    return;
  }

  const remainingBooking = await MongoScheduleBooking.findOne({
    familyMemberId: context.member._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  })
    .sort({ startUtc: 1, createdAt: 1 })
    .lean();

  if (!remainingBooking) {
    await syncTeacherAssignment({
      family: context.family,
      member: context.member,
      studentDoc: context.studentDoc,
      studentId: context.studentId,
      teacher: null,
      studentTimezone: pickFirstString(
        context.member?.timezone,
        context.member?.raw?.timezone,
        context.family?.timezone,
        context.family?.raw?.timezone,
      ),
    });
    return;
  }

  const remainingTeacherId = pickFirstString(
    remainingBooking.teacherId,
    remainingBooking.teacherUid,
    remainingBooking.teacherEmployeeId,
  );
  const remainingTeacher = remainingTeacherId
    ? await resolveTeacherRecord(remainingTeacherId).catch(() => null)
    : null;

  await syncTeacherAssignment({
    family: context.family,
    member: context.member,
    studentDoc: context.studentDoc,
    studentId: context.studentId,
    teacher: remainingTeacher,
    studentTimezone: pickFirstString(
      remainingBooking.studentTimezone,
      context.member?.timezone,
      context.member?.raw?.timezone,
      context.family?.timezone,
      context.family?.raw?.timezone,
    ),
  });
}

async function unassignTeacherSchedule({
  familyId,
  familyMemberId,
  adminNote = '',
  unassignedBy = 'admin',
}) {
  const context = await resolveFamilyMemberContext(familyId, familyMemberId);
  const currentAssignment = await getCurrentTeacherAssignmentSummary(context).catch(() => null);
  const matchingKeys = uniq([
    pickFirstString(context?.member?._id),
    pickFirstString(context?.member?.uid),
    pickFirstString(context?.member?.studentId),
    pickFirstString(context?.studentDoc?._id),
    pickFirstString(context?.studentId),
  ]);

  const bookingFilter = {
    status: { $in: ACTIVE_BOOKING_STATUSES },
    $or: [
      { familyMemberId: context.member._id },
      ...(matchingKeys.length > 0 ? [{ studentId: { $in: matchingKeys } }] : []),
    ],
  };

  const activeBookings = await MongoScheduleBooking.find(bookingFilter).lean();
  const bookingIds = activeBookings.map((booking) => booking._id).filter(Boolean);
  const notePrefix = String(adminNote || '').trim();
  const adminActionNote = [
    notePrefix,
    `Teacher unassigned by ${unassignedBy}.`,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const requestTeacherIds = Array.isArray(currentAssignment?.teacherIds) ? currentAssignment.teacherIds : [];
  const openRequests = requestTeacherIds.length > 0
    ? await MongoScheduleAssignmentRequest.find(
      {
        familyId: context.family._id,
        familyMemberId: context.member._id,
        status: { $in: ['pending', 'accepted'] },
        $or: [
          { teacherId: { $in: requestTeacherIds } },
          { teacherUid: { $in: requestTeacherIds } },
          { teacherEmployeeId: { $in: requestTeacherIds } },
        ],
      },
      { _id: 1 }
    ).lean()
    : [];
  const cancelledRequestIds = openRequests
    .map((requestDoc) => pickFirstString(requestDoc?._id, requestDoc?.id))
    .filter(Boolean);

  if (bookingIds.length > 0) {
    await MongoScheduleBooking.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: {
          status: 'cancelled',
          adminNote: adminActionNote,
          updatedAt: new Date(),
        },
      }
    );
  }

  if (cancelledRequestIds.length > 0) {
    await MongoScheduleAssignmentRequest.updateMany(
      { _id: { $in: cancelledRequestIds } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: String(unassignedBy || 'admin').trim() || 'admin',
          'raw.cancellationReason': adminActionNote || 'Teacher unassigned.',
        },
      }
    );
  }

  await appendTeacherAssignmentHistory({
    context,
    currentAssignment,
    cancelledBookingIds: bookingIds.map((bookingId) => pickFirstString(bookingId)).filter(Boolean),
    cancelledRequestIds,
    note: adminActionNote,
    changedBy: unassignedBy,
  });

  await syncTeacherAssignment({
    family: context.family,
    member: context.member,
    studentDoc: context.studentDoc,
    studentId: context.studentId,
    teacher: null,
    studentTimezone: pickFirstString(
      context.member?.timezone,
      context.member?.raw?.timezone,
      context.studentDoc?.raw?.timezone,
      context.family?.timezone,
      context.family?.raw?.timezone,
    ),
  });

  return {
    success: true,
    familyId: context.family._id,
    familyMemberId: context.member._id,
    studentId: context.studentId || null,
    studentName: context.studentName,
    cancelledBookingCount: bookingIds.length,
    cancelledRequestCount: cancelledRequestIds.length,
  };
}

async function findTeacherBookingConflict(teacher, slotStartUtc, slotEndUtc, excludeBookingId = null) {
  const query = {
    status: { $in: ACTIVE_BOOKING_STATUSES },
    $or: [
      { teacherId: teacher.canonicalId },
      { teacherUid: teacher.canonicalId },
    ],
    startUtc: { $lt: slotEndUtc.toJSDate() },
    endUtc: { $gt: slotStartUtc.toJSDate() },
  };
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  return MongoScheduleBooking.findOne(query).lean();
}

async function findStudentBookingConflict(familyMemberId, slotStartUtc, slotEndUtc, excludeBookingId = null) {
  const query = {
    familyMemberId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    startUtc: { $lt: slotEndUtc.toJSDate() },
    endUtc: { $gt: slotStartUtc.toJSDate() },
  };
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
  return MongoScheduleBooking.findOne(query).lean();
}

async function findAssignedTeacherConflict(context, requestedTeacher, excludeBookingId = null) {
  const requestedTeacherIds = new Set(uniq([
    pickFirstString(requestedTeacher?.canonicalId),
    pickFirstString(requestedTeacher?.employeeId),
    pickFirstString(requestedTeacher?.userId),
    pickFirstString(requestedTeacher?.uid),
  ]));
  if (requestedTeacherIds.size === 0) {
    return null;
  }

  const storedTeacherIds = uniq([
    pickFirstString(context?.member?.assignedTeacher),
    pickFirstString(context?.member?.raw?.assignedTeacher),
    pickFirstString(context?.member?.raw?.teacherId),
    pickFirstString(context?.studentDoc?.assignedTeacher),
    pickFirstString(context?.studentDoc?.teacherId),
    pickFirstString(context?.studentDoc?.raw?.assignedTeacher),
    pickFirstString(context?.studentDoc?.raw?.teacherId),
  ]);

  const assignedTeacherName = pickFirstString(
    context?.member?.assignedTeacherName,
    context?.member?.raw?.assignedTeacherName,
    context?.studentDoc?.assignedTeacherName,
    context?.studentDoc?.raw?.assignedTeacherName
  );

  const storedTeacherId = storedTeacherIds.find((teacherId) => !requestedTeacherIds.has(teacherId));
  if (storedTeacherId) {
    const resolvedTeacher = await resolveTeacherRecord(storedTeacherId).catch(() => null);
    const resolvedTeacherIds = uniq([
      storedTeacherId,
      pickFirstString(resolvedTeacher?.canonicalId),
      pickFirstString(resolvedTeacher?.employeeId),
      pickFirstString(resolvedTeacher?.userId),
      pickFirstString(resolvedTeacher?.uid),
    ]);
    if (resolvedTeacherIds.some((teacherId) => requestedTeacherIds.has(teacherId))) {
      return null;
    }
    return {
      type: 'student_teacher_conflict',
      studentName: context?.studentName || 'Student',
      assignedTeacherId: pickFirstString(resolvedTeacher?.canonicalId, storedTeacherId),
      assignedTeacherName: pickFirstString(resolvedTeacher?.name, assignedTeacherName, storedTeacherId),
      requestedTeacherId: requestedTeacher.canonicalId,
      requestedTeacherName: requestedTeacher.name,
    };
  }

  const otherBookings = await MongoScheduleBooking.find({
    familyMemberId: context?.member?._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  })
    .sort({ startUtc: 1 })
    .lean();

  const otherBooking = (Array.isArray(otherBookings) ? otherBookings : []).find((booking) => {
    const bookingTeacherIds = uniq([
      pickFirstString(booking?.teacherId),
      pickFirstString(booking?.teacherUid),
    ]);
    return bookingTeacherIds.length > 0 && !bookingTeacherIds.some((teacherId) => requestedTeacherIds.has(teacherId));
  });

  if (!otherBooking) {
    return null;
  }

  const bookingTeacherId = pickFirstString(otherBooking.teacherId, otherBooking.teacherUid);
  if (!bookingTeacherId || requestedTeacherIds.has(bookingTeacherId)) {
    return null;
  }

  const resolvedTeacher = await resolveTeacherRecord(bookingTeacherId).catch(() => null);
  return {
    type: 'student_teacher_conflict',
    studentName: context?.studentName || pickFirstString(otherBooking.studentName) || 'Student',
    assignedTeacherId: pickFirstString(resolvedTeacher?.canonicalId, bookingTeacherId),
    assignedTeacherName: pickFirstString(resolvedTeacher?.name, otherBooking.teacherName, bookingTeacherId),
    requestedTeacherId: requestedTeacher.canonicalId,
    requestedTeacherName: requestedTeacher.name,
    conflictingBookingId: otherBooking._id,
  };
}

async function createBooking({
  teacherId,
  familyId,
  familyMemberId,
  studentDate,
  studentTime,
  studentEndTime = '',
  studentTimezone,
  teacherDate = '',
  teacherTime = '',
  durationMinutes = DEFAULT_SLOT_MINUTES,
  adminNote = '',
  assignedBy = '',
  bookingSource = 'admin_search',
}) {
  const teacher = await resolveTeacherRecord(teacherId);
  const context = await resolveFamilyMemberContext(familyId, familyMemberId);
  const assignmentConflict = await findAssignedTeacherConflict(context, teacher);
  if (assignmentConflict) {
    const error = new Error(`${assignmentConflict.studentName} is already assigned to ${assignmentConflict.assignedTeacherName}.`);
    error.statusCode = 409;
    error.details = assignmentConflict;
    throw error;
  }

  const effectiveStudentTimezone = normalizeTimezone(
    pickFirstString(studentTimezone, context.member?.timezone, context.member?.raw?.timezone, context.family?.timezone, context.family?.raw?.timezone),
    'UTC'
  );
  const effectiveDurationMinutes = resolveDurationMinutes({
    studentTime,
    studentEndTime,
    durationMinutes,
  });
  const normalizedTeacherDate = pickFirstString(teacherDate) ? normalizeDateKey(teacherDate) : null;
  const normalizedTeacherTime = pickFirstString(teacherTime) ? normalizeTimeString(teacherTime) : null;
  if ((pickFirstString(teacherDate) || pickFirstString(teacherTime)) && (!normalizedTeacherDate || !normalizedTeacherTime)) {
    throw new Error('teacherDate and teacherTime must be valid values (YYYY-MM-DD and HH:mm).');
  }

  let slotStartUtc;
  let slotEndUtc;
  let availabilityMeta = {
    source: '',
    date: '',
  };

  if (normalizedTeacherDate && normalizedTeacherTime) {
    const teacherLocalStart = createLocalDateTime(normalizedTeacherDate, normalizedTeacherTime, teacher.timezone);
    slotStartUtc = teacherLocalStart.toUTC();
    slotEndUtc = teacherLocalStart.plus({ minutes: effectiveDurationMinutes }).toUTC();

    const availability = await findTeacherAvailabilityForSpecificSlot(teacher, slotStartUtc, slotEndUtc);
    if (!availability) {
      const error = new Error('Selected teacher is not available for this slot.');
      error.statusCode = 409;
      throw error;
    }
    availabilityMeta = {
      source: availability.source,
      date: availability.dateKey,
    };
  } else {
    const searchResult = await searchAvailableTeachers({
      studentDate,
      studentTime,
      studentTimezone: effectiveStudentTimezone,
      durationMinutes: effectiveDurationMinutes,
      includeUnavailable: false,
    });

    const matchingTeacher = searchResult.teachers.find((candidate) => candidate.teacherId === teacher.canonicalId);
    if (!matchingTeacher) {
      const error = new Error('Selected teacher is not available for this slot.');
      error.statusCode = 409;
      throw error;
    }

    slotStartUtc = DateTime.fromISO(matchingTeacher.slotStartUtc, { zone: 'utc' });
    slotEndUtc = DateTime.fromISO(matchingTeacher.slotEndUtc, { zone: 'utc' });
    availabilityMeta = {
      source: matchingTeacher.availabilitySource,
      date: matchingTeacher.availabilityDate,
    };
  }

  const [teacherConflict, studentConflict] = await Promise.all([
    findTeacherBookingConflict(teacher, slotStartUtc, slotEndUtc),
    findStudentBookingConflict(context.member._id, slotStartUtc, slotEndUtc),
  ]);

  if (teacherConflict) {
    const error = new Error('Teacher already has another class in this slot.');
    error.statusCode = 409;
    error.details = teacherConflict;
    throw error;
  }

  if (studentConflict) {
    const error = new Error('Student already has another class in this slot.');
    error.statusCode = 409;
    error.details = studentConflict;
    throw error;
  }

  const businessSnapshot = buildBusinessSnapshot(slotStartUtc, DEFAULT_BUSINESS_TIMEZONE);
  const studentLocalStart = buildLocalSnapshot(slotStartUtc, effectiveStudentTimezone);
  const studentLocalEnd = buildLocalSnapshot(slotEndUtc, effectiveStudentTimezone);
  const teacherLocalStart = buildLocalSnapshot(slotStartUtc, teacher.timezone);
  const teacherLocalEnd = buildLocalSnapshot(slotEndUtc, teacher.timezone);

  const booking = await MongoScheduleBooking.create({
    _id: buildId(),
    teacherId: teacher.canonicalId,
    teacherUid: teacher.uid,
    teacherEmployeeId: teacher.employeeId,
    teacherName: teacher.name,
    teacherTimezone: teacher.timezone,
    familyId: context.family._id,
    familyMemberId: context.member._id,
    studentId: context.studentId || null,
    studentName: context.studentName,
    studentTimezone: effectiveStudentTimezone,
    startUtc: slotStartUtc.toJSDate(),
    endUtc: slotEndUtc.toJSDate(),
    durationMinutes: effectiveDurationMinutes,
    status: 'booked',
    bookingSource,
    anchorType: 'student_local',
    studentLocalDate: studentLocalStart.date,
    studentLocalStartTime: studentLocalStart.time,
    studentLocalEndTime: studentLocalEnd.time,
    teacherLocalDate: teacherLocalStart.date,
    teacherLocalStartTime: teacherLocalStart.time,
    teacherLocalEndTime: teacherLocalEnd.time,
    businessTimezone: businessSnapshot.timezone,
    businessDate: businessSnapshot.date,
    businessMonthKey: businessSnapshot.monthKey,
    assignedBy,
    adminNote: String(adminNote || '').trim(),
    raw: {
      availabilitySource: availabilityMeta.source,
      availabilityDate: availabilityMeta.date,
    },
  });

  await syncTeacherAssignment({
    family: context.family,
    member: context.member,
    studentDoc: context.studentDoc,
    studentId: context.studentId,
    teacher,
    studentTimezone: effectiveStudentTimezone,
  });

  return { success: true, booking: booking.toObject() };
}

async function persistStudentSchedulingPreferences({
  context,
  studentDate,
  studentTime,
  studentEndTime = '',
  studentTimezone,
  durationMinutes,
  requiredDays = [],
  studentNeeds = '',
}) {
  if (!context?.member?._id) {
    return;
  }

  const timezone = normalizeTimezone(
    pickFirstString(
      studentTimezone,
      context.member?.timezone,
      context.member?.raw?.timezone,
      context.family?.timezone,
      context.family?.raw?.timezone
    ),
    'UTC'
  );
  const normalizedDate = normalizeDateKey(studentDate) || DateTime.now().setZone(timezone).toISODate();
  const normalizedStartTime = normalizeTimeString(studentTime) || '';
  const normalizedEndTime = normalizeTimeString(studentEndTime) || '';
  const normalizedDurationMinutes = resolveDurationMinutes({
    studentTime: normalizedStartTime,
    studentEndTime: normalizedEndTime,
    durationMinutes,
  });
  const normalizedRequiredDays = normalizeRequestedWeekdays(requiredDays).map((weekday) => weekdayIndexToName(weekday));
  const cleanedNeeds = String(studentNeeds || '').trim();
  const normalizedStudentId = pickFirstString(context.studentDoc?._id, context.studentId);

  await MongoFamilyMember.updateOne(
    { _id: context.member._id },
    {
      $set: {
        timezone,
        'raw.timezone': timezone,
        'raw.preferredStartTime': normalizedStartTime,
        'raw.preferredEndTime': normalizedEndTime,
        'raw.preferredDurationMinutes': normalizedDurationMinutes,
        'raw.preferredClassDays': normalizedRequiredDays,
        'raw.preferredScheduleAnchorDate': normalizedDate,
        'raw.studentNeeds': cleanedNeeds,
      },
    }
  );

  if (normalizedStudentId) {
    await MongoStudent.updateOne(
      { _id: normalizedStudentId },
      {
        $set: {
          timezone,
          'raw.timezone': timezone,
          'raw.preferredStartTime': normalizedStartTime,
          'raw.preferredEndTime': normalizedEndTime,
          'raw.preferredDurationMinutes': normalizedDurationMinutes,
          'raw.preferredClassDays': normalizedRequiredDays,
          'raw.preferredScheduleAnchorDate': normalizedDate,
          'raw.studentNeeds': cleanedNeeds,
        },
      },
      { upsert: false }
    );
  }
}

async function assignTeacherSchedule({
  teacherId,
  familyId,
  familyMemberId,
  studentDate,
  studentTime,
  studentEndTime = '',
  studentTimezone,
  durationMinutes = DEFAULT_SLOT_MINUTES,
  requiredDays = [],
  studentNeeds = '',
  adminNote = '',
  assignedBy = '',
  bookingSource = 'admin_assign',
}) {
  const teacher = await resolveTeacherRecord(teacherId);
  const context = await resolveFamilyMemberContext(familyId, familyMemberId);
  const assignmentConflict = await findAssignedTeacherConflict(context, teacher);
  if (assignmentConflict) {
    const error = new Error(`${assignmentConflict.studentName} is already assigned to ${assignmentConflict.assignedTeacherName}.`);
    error.statusCode = 409;
    error.details = assignmentConflict;
    throw error;
  }

  const effectiveStudentTimezone = normalizeTimezone(
    pickFirstString(
      studentTimezone,
      context.member?.timezone,
      context.member?.raw?.timezone,
      context.family?.timezone,
      context.family?.raw?.timezone
    ),
    'UTC'
  );
  const normalizedStudentDate = normalizeDateKey(studentDate) || DateTime.now().setZone(effectiveStudentTimezone).toISODate();
  const normalizedStudentTime = normalizeTimeString(studentTime);
  if (!normalizedStudentTime) {
    throw new Error('studentTime must be a valid HH:mm value.');
  }
  const effectiveDurationMinutes = resolveDurationMinutes({
    studentTime: normalizedStudentTime,
    studentEndTime,
    durationMinutes,
  });
  const normalizedRequiredDays = normalizeRequestedWeekdays(requiredDays);
  if (normalizedRequiredDays.length === 0) {
    throw new Error('At least one required day is needed to assign a teacher schedule.');
  }

  const searchResult = await searchAvailableTeachers({
    studentDate: normalizedStudentDate,
    studentTime: normalizedStudentTime,
    studentTimezone: effectiveStudentTimezone,
    durationMinutes: effectiveDurationMinutes,
    requiredDays: normalizedRequiredDays,
    includeUnavailable: false,
  });
  const matchingTeacher = (Array.isArray(searchResult.teachers) ? searchResult.teachers : []).find(
    (candidate) => candidate.teacherId === teacher.canonicalId
  );
  if (!matchingTeacher) {
    const error = new Error('Selected teacher is not available for all requested days and time.');
    error.statusCode = 409;
    throw error;
  }

  const requestedSlots = buildRequestedStudentSlots({
    studentDate: normalizedStudentDate,
    studentTime: normalizedStudentTime,
    studentTimezone: effectiveStudentTimezone,
    durationMinutes: effectiveDurationMinutes,
    requiredDays: normalizedRequiredDays,
  });

  const preparedSlots = [];
  for (const requestedSlot of requestedSlots) {
    const availability = await findTeacherAvailabilityForSpecificSlot(
      teacher,
      requestedSlot.startUtc,
      requestedSlot.endUtc,
    );
    if (!availability) {
      const error = new Error(`Selected teacher is not available on ${requestedSlot.weekdayName}.`);
      error.statusCode = 409;
      throw error;
    }

    const [teacherConflict, studentConflict] = await Promise.all([
      findTeacherBookingConflict(teacher, requestedSlot.startUtc, requestedSlot.endUtc),
      findStudentBookingConflict(context.member._id, requestedSlot.startUtc, requestedSlot.endUtc),
    ]);
    if (teacherConflict) {
      const error = new Error(`Teacher already has another class on ${requestedSlot.weekdayName} in this slot.`);
      error.statusCode = 409;
      error.details = teacherConflict;
      throw error;
    }
    if (studentConflict) {
      const error = new Error(`Student already has another class on ${requestedSlot.weekdayName} in this slot.`);
      error.statusCode = 409;
      error.details = studentConflict;
      throw error;
    }

    preparedSlots.push({
      requestedSlot,
      availability,
    });
  }

  const bookingDocs = preparedSlots.map(({ requestedSlot, availability }) => {
    const businessSnapshot = buildBusinessSnapshot(requestedSlot.startUtc, DEFAULT_BUSINESS_TIMEZONE);
    const studentLocalStart = buildLocalSnapshot(requestedSlot.startUtc, effectiveStudentTimezone);
    const studentLocalEnd = buildLocalSnapshot(requestedSlot.endUtc, effectiveStudentTimezone);
    const teacherLocalStart = buildLocalSnapshot(requestedSlot.startUtc, teacher.timezone);
    const teacherLocalEnd = buildLocalSnapshot(requestedSlot.endUtc, teacher.timezone);

    return {
      _id: buildId(),
      teacherId: teacher.canonicalId,
      teacherUid: teacher.uid,
      teacherEmployeeId: teacher.employeeId,
      teacherName: teacher.name,
      teacherTimezone: teacher.timezone,
      familyId: context.family._id,
      familyMemberId: context.member._id,
      studentId: context.studentId || null,
      studentName: context.studentName,
      studentTimezone: effectiveStudentTimezone,
      startUtc: requestedSlot.startUtc.toJSDate(),
      endUtc: requestedSlot.endUtc.toJSDate(),
      durationMinutes: effectiveDurationMinutes,
      status: 'booked',
      bookingSource,
      anchorType: 'student_local',
      studentLocalDate: studentLocalStart.date,
      studentLocalStartTime: studentLocalStart.time,
      studentLocalEndTime: studentLocalEnd.time,
      teacherLocalDate: teacherLocalStart.date,
      teacherLocalStartTime: teacherLocalStart.time,
      teacherLocalEndTime: teacherLocalEnd.time,
      businessTimezone: businessSnapshot.timezone,
      businessDate: businessSnapshot.date,
      businessMonthKey: businessSnapshot.monthKey,
      assignedBy,
      adminNote: String(adminNote || '').trim(),
      raw: {
        availabilitySource: availability.source,
        availabilityDate: availability.dateKey,
      },
    };
  });

  let createdBookings = [];
  try {
    createdBookings = await MongoScheduleBooking.insertMany(bookingDocs, { ordered: true });
    await syncTeacherAssignment({
      family: context.family,
      member: context.member,
      studentDoc: context.studentDoc,
      studentId: context.studentId,
      teacher,
      studentTimezone: effectiveStudentTimezone,
    });
    await persistStudentSchedulingPreferences({
      context,
      studentDate: normalizedStudentDate,
      studentTime: normalizedStudentTime,
      studentEndTime,
      studentTimezone: effectiveStudentTimezone,
      durationMinutes: effectiveDurationMinutes,
      requiredDays: normalizedRequiredDays,
      studentNeeds,
    });
  } catch (error) {
    const bookingIds = createdBookings.map((booking) => booking?._id).filter(Boolean);
    if (bookingIds.length > 0) {
      await MongoScheduleBooking.deleteMany({ _id: { $in: bookingIds } });
      await reconcileTeacherAssignmentForContext(context);
    }
    throw error;
  }

  return {
    success: true,
    teacher: {
      teacherId: teacher.canonicalId,
      teacherName: teacher.name,
      teacherTimezone: teacher.timezone,
      teacherGender: teacher.gender,
      teacherNationality: teacher.nationality,
      teacherCategory: teacher.category,
    },
    requestedDays: normalizedRequiredDays.map((weekday) => weekdayIndexToName(weekday)),
    bookings: createdBookings.map((booking) => (booking?.toObject ? booking.toObject() : booking)),
    matchedDays: matchingTeacher.matchedDays || [],
  };
}

async function listBookings(filters = {}) {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.familyId) {
    query.familyId = String(filters.familyId).trim();
  }
  if (filters.familyMemberId) {
    query.familyMemberId = String(filters.familyMemberId).trim();
  }
  if (filters.studentId) {
    query.studentId = String(filters.studentId).trim();
  }
  if (filters.businessDate) {
    query.businessDate = normalizeDateKey(filters.businessDate);
  }
  if (filters.dateFrom || filters.dateTo) {
    query.startUtc = {};
    if (filters.dateFrom) {
      query.startUtc.$gte = DateTime.fromISO(normalizeDateKey(filters.dateFrom), { zone: 'utc' }).startOf('day').toJSDate();
    }
    if (filters.dateTo) {
      query.startUtc.$lte = DateTime.fromISO(normalizeDateKey(filters.dateTo), { zone: 'utc' }).endOf('day').toJSDate();
    }
  }
  if (filters.teacherId) {
    const teacher = await resolveTeacherRecord(filters.teacherId);
    query.$or = [
      { teacherId: teacher.canonicalId },
      { teacherUid: teacher.canonicalId },
      { teacherEmployeeId: teacher.employeeId },
    ];
  }

  const bookings = await MongoScheduleBooking.find(query).sort({ startUtc: 1, createdAt: 1 }).lean();
  return { success: true, bookings };
}

async function updateBooking(bookingId, updates = {}) {
  const existing = await MongoScheduleBooking.findById(bookingId).lean();
  if (!existing) {
    throw new Error('Booking not found.');
  }

  const isStatusOnlyUpdate = Boolean(
    updates.status
    && !updates.studentDate
    && !updates.studentTime
    && !updates.teacherId
    && !updates.studentTimezone
    && !updates.familyId
    && !updates.familyMemberId
    && !updates.durationMinutes
  );

  if (isStatusOnlyUpdate) {
    const updated = await MongoScheduleBooking.findByIdAndUpdate(
      bookingId,
      {
        $set: {
          status: updates.status,
          adminNote: typeof updates.adminNote === 'string' ? updates.adminNote.trim() : existing.adminNote,
        },
      },
      { new: true }
    ).lean();

    if (!ACTIVE_BOOKING_STATUSES.includes(String(updated?.status || '').toLowerCase())) {
      const existingContext = await resolveFamilyMemberContext(existing.familyId, existing.familyMemberId).catch(() => null);
      if (existingContext) {
        await reconcileTeacherAssignmentForContext(existingContext, bookingId);
      }
    }

    return { success: true, booking: updated };
  }

  const teacher = await resolveTeacherRecord(updates.teacherId || existing.teacherId);
  const nextFamilyId = String(updates.familyId || existing.familyId || '').trim();
  const nextFamilyMemberId = String(updates.familyMemberId || existing.familyMemberId || '').trim();
  const context = await resolveFamilyMemberContext(nextFamilyId, nextFamilyMemberId);
  const assignmentConflict = await findAssignedTeacherConflict(context, teacher, bookingId);
  if (assignmentConflict) {
    const error = new Error(`${assignmentConflict.studentName} is already assigned to ${assignmentConflict.assignedTeacherName}.`);
    error.statusCode = 409;
    error.details = assignmentConflict;
    throw error;
  }
  const studentTimezone = normalizeTimezone(updates.studentTimezone || existing.studentTimezone, 'UTC');
  const studentDate = updates.studentDate || existing.studentLocalDate;
  const studentTime = updates.studentTime || existing.studentLocalStartTime;
  const durationMinutes = Number(updates.durationMinutes || existing.durationMinutes || DEFAULT_SLOT_MINUTES);

  const searchResult = await searchAvailableTeachers({
    studentDate,
    studentTime,
    studentTimezone,
    durationMinutes,
    includeUnavailable: false,
    excludeBookingId: bookingId,
  });
  const matchingTeacher = searchResult.teachers.find((candidate) => candidate.teacherId === teacher.canonicalId);
  if (!matchingTeacher) {
    const error = new Error('Selected teacher is not available for the updated slot.');
    error.statusCode = 409;
    throw error;
  }

  const slotStartUtc = DateTime.fromISO(matchingTeacher.slotStartUtc, { zone: 'utc' });
  const slotEndUtc = DateTime.fromISO(matchingTeacher.slotEndUtc, { zone: 'utc' });
  const [teacherConflict, studentConflict] = await Promise.all([
    findTeacherBookingConflict(teacher, slotStartUtc, slotEndUtc, bookingId),
    findStudentBookingConflict(context.member._id, slotStartUtc, slotEndUtc, bookingId),
  ]);

  if (teacherConflict) {
    const error = new Error('Teacher already has another class in the updated slot.');
    error.statusCode = 409;
    throw error;
  }

  if (studentConflict) {
    const error = new Error('Student already has another class in the updated slot.');
    error.statusCode = 409;
    throw error;
  }

  const businessSnapshot = buildBusinessSnapshot(slotStartUtc, DEFAULT_BUSINESS_TIMEZONE);
  const studentLocalStart = buildLocalSnapshot(slotStartUtc, studentTimezone);
  const studentLocalEnd = buildLocalSnapshot(slotEndUtc, studentTimezone);
  const teacherLocalStart = buildLocalSnapshot(slotStartUtc, teacher.timezone);
  const teacherLocalEnd = buildLocalSnapshot(slotEndUtc, teacher.timezone);

  const updated = await MongoScheduleBooking.findByIdAndUpdate(
    bookingId,
    {
      $set: {
        teacherId: teacher.canonicalId,
        teacherUid: teacher.uid,
        teacherEmployeeId: teacher.employeeId,
        teacherName: teacher.name,
        teacherTimezone: teacher.timezone,
        familyId: context.family._id,
        familyMemberId: context.member._id,
        studentId: context.studentId || null,
        studentName: context.studentName,
        studentTimezone,
        startUtc: slotStartUtc.toJSDate(),
        endUtc: slotEndUtc.toJSDate(),
        durationMinutes,
        studentLocalDate: studentLocalStart.date,
        studentLocalStartTime: studentLocalStart.time,
        studentLocalEndTime: studentLocalEnd.time,
        teacherLocalDate: teacherLocalStart.date,
        teacherLocalStartTime: teacherLocalStart.time,
        teacherLocalEndTime: teacherLocalEnd.time,
        businessTimezone: businessSnapshot.timezone,
        businessDate: businessSnapshot.date,
        businessMonthKey: businessSnapshot.monthKey,
        adminNote: typeof updates.adminNote === 'string' ? updates.adminNote.trim() : existing.adminNote,
      },
    },
    { new: true }
  ).lean();

  await syncTeacherAssignment({
    family: context.family,
    member: context.member,
    studentDoc: context.studentDoc,
    studentId: context.studentId,
    teacher,
    studentTimezone,
  });

  if (String(existing.familyMemberId || '') !== String(context.member._id || '')) {
    const existingContext = await resolveFamilyMemberContext(existing.familyId, existing.familyMemberId).catch(() => null);
    if (existingContext) {
      await reconcileTeacherAssignmentForContext(existingContext, bookingId);
    }
  }

  return { success: true, booking: updated };
}

async function upsertTeacherAvailability({
  teacherId,
  date,
  timezone,
  ranges = [],
  breaks = [],
  notes = '',
}) {
  const teacher = await resolveTeacherRecord(teacherId);
  const normalizedDate = normalizeDateKey(date);
  if (!normalizedDate) {
    throw new Error('date must be a valid YYYY-MM-DD.');
  }

  const effectiveTimezone = normalizeTimezone(timezone || teacher.timezone, teacher.timezone);
  const normalizedRanges = normalizeStoredRanges(ranges, normalizedDate, effectiveTimezone, 'range');
  const normalizedBreaks = normalizeStoredRanges(breaks, normalizedDate, effectiveTimezone, 'break');

  const availability = await MongoScheduleAvailability.findOneAndUpdate(
    { _id: `${teacher.canonicalId}:${normalizedDate}` },
    {
      $set: {
        _id: `${teacher.canonicalId}:${normalizedDate}`,
        teacherId: teacher.canonicalId,
        teacherUid: teacher.uid,
        teacherName: teacher.name,
        timezone: effectiveTimezone,
        date: normalizedDate,
        ranges: normalizedRanges,
        breaks: normalizedBreaks,
        notes: String(notes || '').trim(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  return { success: true, availability };
}

async function deleteTeacherAvailabilityBreak({
  teacherId,
  date,
  breakId,
}) {
  const teacher = await resolveTeacherRecord(teacherId);
  const normalizedDate = normalizeDateKey(date);
  const normalizedBreakId = pickFirstString(breakId);
  if (!normalizedDate) {
    throw new Error('date must be a valid YYYY-MM-DD.');
  }
  if (!normalizedBreakId) {
    throw new Error('breakId is required.');
  }

  const docId = `${teacher.canonicalId}:${normalizedDate}`;
  const availability = await MongoScheduleAvailability.findOne({ _id: docId });
  if (!availability) {
    throw new Error('Availability override not found for this date.');
  }

  const nextBreaks = (Array.isArray(availability.breaks) ? availability.breaks : [])
    .filter((entry) => pickFirstString(entry?.id) !== normalizedBreakId);

  if (nextBreaks.length === (Array.isArray(availability.breaks) ? availability.breaks : []).length) {
    throw new Error('Break override not found.');
  }

  const hasRanges = Array.isArray(availability.ranges) && availability.ranges.length > 0;
  const hasNotes = Boolean(String(availability.notes || '').trim());

  if (!hasRanges && nextBreaks.length === 0 && !hasNotes) {
    await MongoScheduleAvailability.deleteOne({ _id: docId });
    return { success: true, deleted: true };
  }

  availability.breaks = nextBreaks;
  await availability.save();
  return { success: true, availability: availability.toObject ? availability.toObject() : availability };
}

async function listTeacherAvailability({
  teacherId,
  dateFrom,
  dateTo,
}) {
  const teacher = await resolveTeacherRecord(teacherId);
  const todayInTeacherZone = DateTime.now().setZone(teacher.timezone).toISODate();
  const startDate = normalizeDateKey(dateFrom) || todayInTeacherZone;
  const endDate = normalizeDateKey(dateTo) || DateTime.fromISO(startDate, { zone: 'utc' }).plus({ days: 6 }).toISODate();
  const dateKeys = buildDateRange(startDate, endDate);

  const docs = await MongoScheduleAvailability.find({
    teacherId: teacher.canonicalId,
    date: { $in: dateKeys },
  }).lean();
  const docMap = buildAvailabilityMap(docs);

  const days = dateKeys.map((dateKey) => {
    const explicit = docMap.get(`${teacher.canonicalId}::${dateKey}`);
    if (explicit) {
      return {
        date: dateKey,
        timezone: explicit.timezone || teacher.timezone,
        source: 'daily_override',
        ranges: Array.isArray(explicit.ranges) ? explicit.ranges : [],
        breaks: Array.isArray(explicit.breaks) ? explicit.breaks : [],
        notes: explicit.notes || '',
      };
    }

    return {
      date: dateKey,
      timezone: teacher.timezone,
      source: 'weekly_template',
      ranges: (Array.isArray(teacher.scheduledHours) ? teacher.scheduledHours : [])
        .filter((entry) => normalizeWeekday(entry?.day) === DateTime.fromISO(dateKey, { zone: 'utc' }).weekday)
        .map((entry) => ({
          id: pickFirstString(entry?.id) || buildRangeId('template'),
          startTime: normalizeTimeString(entry?.startTime || entry?.from || entry?.start),
          endTime: normalizeTimeString(entry?.endTime || entry?.to || entry?.end),
          endDayOffset: normalizeTimeString(entry?.endTime || entry?.to || entry?.end) <= normalizeTimeString(entry?.startTime || entry?.from || entry?.start) ? 1 : 0,
          note: pickFirstString(entry?.note, entry?.description),
        }))
        .filter((entry) => entry.startTime && entry.endTime),
      breaks: [],
      notes: '',
    };
  });

  return {
    success: true,
    teacher: {
      teacherId: teacher.canonicalId,
      teacherName: teacher.name,
      teacherTimezone: teacher.timezone,
    },
    days,
  };
}

async function listFutureTeacherBookings(sourceTeacher) {
  return MongoScheduleBooking.find({
    status: { $in: ACTIVE_BOOKING_STATUSES },
    $or: [
      { teacherId: sourceTeacher.canonicalId },
      { teacherUid: sourceTeacher.canonicalId },
      { teacherEmployeeId: sourceTeacher.employeeId },
    ],
    startUtc: { $gte: new Date() },
  }).sort({ startUtc: 1, createdAt: 1 }).lean();
}

function getBookingStudentSlot(booking) {
  const durationMinutes = Number(booking?.durationMinutes || DEFAULT_SLOT_MINUTES);
  const studentTimezone = normalizeTimezone(booking?.studentTimezone, 'UTC');
  const slotStartUtc = booking?.startUtc
    ? DateTime.fromJSDate(new Date(booking.startUtc), { zone: 'utc' })
    : null;

  if (booking?.studentLocalDate && booking?.studentLocalStartTime) {
    return {
      studentDate: booking.studentLocalDate,
      studentTime: booking.studentLocalStartTime,
      studentTimezone,
      durationMinutes,
    };
  }

  if (!slotStartUtc?.isValid) {
    return null;
  }

  const studentLocal = buildLocalSnapshot(slotStartUtc, studentTimezone);
  return {
    studentDate: studentLocal.date,
    studentTime: studentLocal.time,
    studentTimezone,
    durationMinutes,
  };
}

async function getShiftCandidates({ sourceTeacherId }) {
  const sourceTeacher = await resolveTeacherRecord(sourceTeacherId);
  const futureBookings = await listFutureTeacherBookings(sourceTeacher);

  if (futureBookings.length === 0) {
    return {
      success: true,
      sourceTeacher: {
        teacherId: sourceTeacher.canonicalId,
        teacherName: sourceTeacher.name,
        teacherTimezone: sourceTeacher.timezone,
      },
      futureClassCount: 0,
      candidates: [],
    };
  }

  const teacherDetails = new Map();
  let eligibleTeacherIds = null;

  for (const booking of futureBookings) {
    const slot = getBookingStudentSlot(booking);
    if (!slot) {
      continue;
    }

    const searchResult = await searchAvailableTeachers({
      studentDate: slot.studentDate,
      studentTime: slot.studentTime,
      studentTimezone: slot.studentTimezone,
      durationMinutes: slot.durationMinutes,
      includeUnavailable: false,
    });

    const currentEligible = new Set();
    (Array.isArray(searchResult.teachers) ? searchResult.teachers : []).forEach((candidate) => {
      if (candidate.teacherId === sourceTeacher.canonicalId) {
        return;
      }
      currentEligible.add(candidate.teacherId);
      teacherDetails.set(candidate.teacherId, candidate);
    });

    eligibleTeacherIds = eligibleTeacherIds === null
      ? currentEligible
      : new Set([...eligibleTeacherIds].filter((teacherId) => currentEligible.has(teacherId)));

    if (eligibleTeacherIds.size === 0) {
      break;
    }
  }

  const candidates = [...(eligibleTeacherIds || new Set())]
    .map((teacherId) => teacherDetails.get(teacherId))
    .filter(Boolean)
    .sort((left, right) => String(left.teacherName || '').localeCompare(String(right.teacherName || '')))
    .map((candidate) => ({
      teacherId: candidate.teacherId,
      teacherUid: candidate.teacherUid,
      teacherName: candidate.teacherName,
      teacherEmail: candidate.teacherEmail,
      teacherTimezone: candidate.teacherTimezone,
      teacherGender: candidate.teacherGender,
      teacherNationality: candidate.teacherNationality,
      teacherCategory: candidate.teacherCategory,
      matchedFutureClasses: futureBookings.length,
    }));

  return {
    success: true,
    sourceTeacher: {
      teacherId: sourceTeacher.canonicalId,
      teacherName: sourceTeacher.name,
      teacherTimezone: sourceTeacher.timezone,
    },
    futureClassCount: futureBookings.length,
    candidates,
  };
}

async function shiftTeacherSchedule({
  sourceTeacherId,
  targetTeacherId,
  reason = '',
  shiftedBy = 'admin',
}) {
  const sourceTeacher = await resolveTeacherRecord(sourceTeacherId);
  const targetTeacher = await resolveTeacherRecord(targetTeacherId);

  if (sourceTeacher.canonicalId === targetTeacher.canonicalId) {
    throw new Error('Please select a different teacher.');
  }

  const options = await getShiftCandidates({ sourceTeacherId: sourceTeacher.canonicalId });
  const allowedTeacherIds = new Set((options.candidates || []).map((candidate) => candidate.teacherId));
  if (!allowedTeacherIds.has(targetTeacher.canonicalId)) {
    const error = new Error('Selected replacement teacher is not available for all future classes.');
    error.statusCode = 409;
    throw error;
  }

  const futureBookings = await listFutureTeacherBookings(sourceTeacher);
  const movedBookings = [];

  for (const booking of futureBookings) {
    const slot = getBookingStudentSlot(booking);
    if (!slot) {
      continue;
    }

    const result = await updateBooking(booking._id, {
      teacherId: targetTeacher.canonicalId,
      studentDate: slot.studentDate,
      studentTime: slot.studentTime,
      studentTimezone: slot.studentTimezone,
      durationMinutes: slot.durationMinutes,
      adminNote: `Shifted from ${sourceTeacher.name} to ${targetTeacher.name}. ${String(reason || '').trim()}`.trim(),
    });

    movedBookings.push(result.booking || booking);
  }

  const blockReason = String(reason || '').trim() || `Full schedule shifted to ${targetTeacher.name}.`;
  const lockChangedAt = new Date().toISOString();
  const sourceTeacherDoc = await MongoEmployee.findById(
    sourceTeacher.employeeId || sourceTeacher.canonicalId,
    { 'raw.scheduleLockHistory': 1 }
  ).lean();
  const existingLockHistory = Array.isArray(sourceTeacherDoc?.raw?.scheduleLockHistory)
    ? sourceTeacherDoc.raw.scheduleLockHistory
    : [];

  await MongoEmployee.updateOne(
    { _id: sourceTeacher.employeeId || sourceTeacher.canonicalId },
    {
      $set: {
        scheduleLocked: true,
        'raw.scheduleLockReason': blockReason,
        'raw.scheduleLockChangedAt': lockChangedAt,
        'raw.scheduleLockChangedBy': shiftedBy,
        'raw.scheduleLockHistory': [
          ...existingLockHistory,
          {
            id: `schedule-lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: 'block',
            reason: blockReason,
            changedAt: lockChangedAt,
            changedBy: shiftedBy,
          }
        ],
        'raw.shiftedScheduleToTeacherId': targetTeacher.canonicalId,
        'raw.shiftedScheduleToTeacherName': targetTeacher.name,
      },
    }
  );

  return {
    success: true,
    shiftedFutureClasses: movedBookings.length,
    sourceTeacher: {
      teacherId: sourceTeacher.canonicalId,
      teacherName: sourceTeacher.name,
    },
    targetTeacher: {
      teacherId: targetTeacher.canonicalId,
      teacherName: targetTeacher.name,
    },
    blockReason,
  };
}

module.exports = {
  assignTeacherSchedule,
  createBooking,
  getShiftCandidates,
  getCurrentTeacherAssignmentSummary,
  listBookings,
  listTeacherAvailability,
  deleteTeacherAvailabilityBreak,
  resolveFamilyMemberContext,
  resolveTeacherRecord,
  searchAvailableTeachers,
  shiftTeacherSchedule,
  unassignTeacherSchedule,
  updateBooking,
  upsertTeacherAvailability,
};
