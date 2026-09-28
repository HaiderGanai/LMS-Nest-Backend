const { DateTime, IANAZone } = require('luxon');

const DEFAULT_SLOT_MINUTES = Number(process.env.SCHEDULING_SLOT_MINUTES || 15);

function isValidTimezone(zone) {
  const value = String(zone || '').trim();
  return Boolean(value) && IANAZone.isValidZone(value);
}

function normalizeTimezone(zone, fallback = 'UTC') {
  const value = String(zone || '').trim();
  return isValidTimezone(value) ? value : fallback;
}

function normalizeDateKey(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizeTimeString(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDateParts(dateKey) {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    throw new Error('Invalid date. Expected YYYY-MM-DD.');
  }

  const [year, month, day] = normalized.split('-').map(Number);
  return { normalized, year, month, day };
}

function parseTimeParts(timeValue) {
  const normalized = normalizeTimeString(timeValue);
  if (!normalized) {
    throw new Error('Invalid time. Expected HH:mm.');
  }

  const [hour, minute] = normalized.split(':').map(Number);
  return { normalized, hour, minute };
}

function createLocalDateTime(dateKey, timeValue, timezone) {
  const zone = normalizeTimezone(timezone);
  const { normalized: normalizedDate, year, month, day } = parseDateParts(dateKey);
  const { normalized: normalizedTime, hour, minute } = parseTimeParts(timeValue);

  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone }
  );

  if (!dt.isValid) {
    throw new Error(dt.invalidExplanation || 'Invalid local date/time.');
  }

  if (
    dt.year !== year ||
    dt.month !== month ||
    dt.day !== day ||
    dt.hour !== hour ||
    dt.minute !== minute
  ) {
    throw new Error(`Local time ${normalizedDate} ${normalizedTime} does not exist in ${zone}.`);
  }

  const possibilities = typeof dt.getPossibleOffsets === 'function' ? dt.getPossibleOffsets() : [dt];
  if (possibilities.length > 1) {
    throw new Error(`Local time ${normalizedDate} ${normalizedTime} is ambiguous in ${zone} because of daylight saving.`);
  }

  return dt;
}

function weekdayIndexToName(weekdayIndex) {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return names[weekdayIndex - 1] || '';
}

function normalizeWeekday(value) {
  if (typeof value === 'number' && value >= 1 && value <= 7) {
    return value;
  }

  const raw = String(value || '').trim().toLowerCase();
  const mapping = {
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7,
  };
  return mapping[raw] || null;
}

function calculateEndDateKey(startDateKey, startTimeValue, endTimeValue, endDayOffset = null) {
  const startDate = DateTime.fromISO(startDateKey, { zone: 'utc' });
  const normalizedStartTime = normalizeTimeString(startTimeValue);
  const normalizedEndTime = normalizeTimeString(endTimeValue);
  if (!startDate.isValid || !normalizedStartTime || !normalizedEndTime) {
    throw new Error('Invalid range definition.');
  }

  if (Number.isInteger(endDayOffset)) {
    return startDate.plus({ days: endDayOffset }).toISODate();
  }

  if (normalizedEndTime <= normalizedStartTime) {
    return startDate.plus({ days: 1 }).toISODate();
  }

  return startDateKey;
}

function buildRangeInterval(range, dateKey, timezone) {
  const startTime = range?.startTime || range?.from || range?.start;
  const endTime = range?.endTime || range?.to || range?.end;
  if (!startTime || !endTime) return null;

  const startDateKey = range?.date ? normalizeDateKey(range.date) || dateKey : dateKey;
  const endDateKey = range?.endDate
    ? normalizeDateKey(range.endDate)
    : calculateEndDateKey(startDateKey, startTime, endTime, Number.isInteger(range?.endDayOffset) ? range.endDayOffset : null);

  if (!startDateKey || !endDateKey) return null;

  const start = createLocalDateTime(startDateKey, startTime, timezone);
  const end = createLocalDateTime(endDateKey, endTime, timezone);
  if (end <= start) return null;

  return {
    start,
    end,
    startDateKey,
    endDateKey,
    startTime: normalizeTimeString(startTime),
    endTime: normalizeTimeString(endTime),
    note: String(range?.note || range?.description || '').trim(),
  };
}

function doesUtcSlotFitIntervals(slotStartUtc, slotEndUtc, intervals) {
  return intervals.some((interval) => slotStartUtc >= interval.start.toUTC() && slotEndUtc <= interval.end.toUTC());
}

function doesUtcSlotOverlapIntervals(slotStartUtc, slotEndUtc, intervals) {
  return intervals.some((interval) => slotStartUtc < interval.end.toUTC() && slotEndUtc > interval.start.toUTC());
}

function validateSlotBoundary(timeValue, slotMinutes = DEFAULT_SLOT_MINUTES) {
  const { minute } = parseTimeParts(timeValue);
  if (minute % slotMinutes !== 0) {
    throw new Error(`Start time must align to ${slotMinutes}-minute slots.`);
  }
}

function buildUtcSlotFromStudentInput({
  studentDate,
  studentTime,
  studentTimezone,
  durationMinutes = DEFAULT_SLOT_MINUTES,
}) {
  validateSlotBoundary(studentTime, durationMinutes);
  const zone = normalizeTimezone(studentTimezone);
  const startLocal = createLocalDateTime(studentDate, studentTime, zone);
  const endLocal = startLocal.plus({ minutes: durationMinutes });

  return {
    startUtc: startLocal.toUTC(),
    endUtc: endLocal.toUTC(),
    studentLocalStart: startLocal,
    studentLocalEnd: endLocal,
  };
}

function buildLocalSnapshot(dtUtc, timezone) {
  const dt = dtUtc.setZone(normalizeTimezone(timezone));
  return {
    timezone: dt.zoneName,
    date: dt.toISODate(),
    time: dt.toFormat('HH:mm'),
    dateTime: dt.toISO({ suppressMilliseconds: true }),
    offsetMinutes: dt.offset,
    offsetNameShort: dt.offsetNameShort,
    weekday: weekdayIndexToName(dt.weekday),
  };
}

function buildBusinessSnapshot(dtUtc, timezone) {
  const local = buildLocalSnapshot(dtUtc, timezone);
  return {
    timezone: local.timezone,
    date: local.date,
    monthKey: DateTime.fromISO(local.date, { zone: 'utc' }).toFormat('yyyy-LL'),
  };
}

function getTeacherCandidateDateKeys(dtUtc, teacherTimezone) {
  const teacherLocal = dtUtc.setZone(normalizeTimezone(teacherTimezone));
  return [
    teacherLocal.minus({ days: 1 }).toISODate(),
    teacherLocal.toISODate(),
  ];
}

function expandIntervalsFromRanges(ranges, dateKey, timezone) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      try {
        return buildRangeInterval(range, dateKey, timezone);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = {
  DEFAULT_SLOT_MINUTES,
  buildBusinessSnapshot,
  buildLocalSnapshot,
  buildUtcSlotFromStudentInput,
  createLocalDateTime,
  doesUtcSlotFitIntervals,
  doesUtcSlotOverlapIntervals,
  expandIntervalsFromRanges,
  getTeacherCandidateDateKeys,
  isValidTimezone,
  normalizeDateKey,
  normalizeTimeString,
  normalizeTimezone,
  normalizeWeekday,
  parseTimeParts,
  weekdayIndexToName,
};
