const crypto = require('crypto');
const MongoCallAlert = require('../models/CallAlert');
const MongoScheduleAssignmentRequest = require('../models/ScheduleAssignmentRequest');
const {
  normalizeDateKey,
  normalizeTimeString,
  normalizeTimezone,
  normalizeWeekday,
  weekdayIndexToName,
} = require('./scheduling');
const schedulingService = require('./schedulingService');

const OPEN_REQUEST_STATUSES = ['pending', 'accepted'];
const ALLOWED_REQUEST_STATUSES = ['pending', 'accepted', 'rejected', 'finalized', 'superseded', 'cancelled'];

function buildId(prefix = 'sar') {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function uniq(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).filter(Boolean)));
}

function pickFirstString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function addMinutesToTime(timeValue, minutesToAdd) {
  const normalized = normalizeTimeString(timeValue);
  const duration = Number(minutesToAdd || 0);
  if (!normalized || !Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes + duration;
  if (totalMinutes <= 0 || totalMinutes >= (24 * 60)) {
    return '';
  }

  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

function normalizeRequiredDays(values = []) {
  const normalized = uniq(values)
    .map((value) => normalizeWeekday(value))
    .filter(Boolean)
    .sort((left, right) => left - right)
    .map((weekday) => weekdayIndexToName(weekday));

  return uniq(normalized);
}

function normalizeStatuses(values = []) {
  return uniq(values)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => ALLOWED_REQUEST_STATUSES.includes(value));
}

function matchesTeacherRequest(requestDoc, teacher) {
  const teacherIds = new Set(uniq([
    requestDoc?.teacherId,
    requestDoc?.teacherUid,
    requestDoc?.teacherEmployeeId,
  ]));

  return uniq([
    teacher?.canonicalId,
    teacher?.uid,
    teacher?.employeeId,
    teacher?.userId,
  ]).some((value) => teacherIds.has(value));
}

async function loadAvailableTeacherCandidates({
  studentDate,
  studentTime,
  studentEndTime = '',
  studentTimezone,
  durationMinutes,
  requiredDays,
}) {
  const result = await schedulingService.searchAvailableTeachers({
    studentDate,
    studentTime,
    studentEndTime,
    studentTimezone,
    durationMinutes,
    requiredDays,
    includeUnavailable: false,
  });

  const candidateMap = new Map();
  (Array.isArray(result?.teachers) ? result.teachers : []).forEach((candidate) => {
    if (candidate?.teacherId) {
      candidateMap.set(candidate.teacherId, candidate);
    }
  });

  return { result, candidateMap };
}

async function createAdminAlertForRequestResponse(requestDoc, nextStatus) {
  if (!requestDoc || !['accepted', 'rejected'].includes(nextStatus)) {
    return null;
  }

  const note = pickFirstString(requestDoc.teacherResponseNote);
  const reason = nextStatus === 'accepted'
    ? `${requestDoc.teacherName} accepted the schedule request for ${requestDoc.studentName}.`
    : `${requestDoc.teacherName} rejected the schedule request for ${requestDoc.studentName}${note ? `: ${note}` : '.'}`;

  const now = new Date();
  const alertId = buildId('schedule_alert');

  await MongoCallAlert.create({
    _id: alertId,
    teacherId: requestDoc.teacherId,
    studentId: requestDoc.studentId || requestDoc.familyMemberId,
    type: nextStatus === 'accepted' ? 'schedule_request_accepted' : 'schedule_request_rejected',
    read: false,
    timestamp: now,
    reason,
    severity: nextStatus === 'accepted' ? 'low' : 'medium',
    raw: {
      alertCategory: 'scheduling',
      alertSource: 'schedule_assignment_request',
      source: 'schedule_assignment_request',
      communicationType: 'schedule_request',
      teacherName: requestDoc.teacherName,
      studentName: requestDoc.studentName,
      requestId: requestDoc._id,
      batchId: requestDoc.batchId,
      requestStatus: nextStatus,
      note,
      studentDate: requestDoc.studentDate,
      studentTime: requestDoc.studentTime,
      studentEndTime: requestDoc.studentEndTime,
      studentTimezone: requestDoc.studentTimezone,
      durationMinutes: requestDoc.durationMinutes,
      requiredDays: requestDoc.requiredDays,
      studentNeeds: requestDoc.studentNeeds,
      respondedAt: requestDoc.respondedAt || now,
    },
  });

  return alertId;
}

async function createAssignmentRequests({
  teacherIds = [],
  familyId,
  familyMemberId,
  studentDate,
  studentTime,
  studentEndTime = '',
  studentTimezone,
  durationMinutes,
  requiredDays = [],
  studentNeeds = '',
  requestNote = '',
  requestedBy = 'admin',
  requestedByName = 'Admin',
}) {
  const normalizedFamilyId = String(familyId || '').trim();
  const normalizedFamilyMemberId = String(familyMemberId || '').trim();
  const normalizedStudentDate = normalizeDateKey(studentDate);
  const normalizedStudentTime = normalizeTimeString(studentTime);
  const normalizedTimezone = normalizeTimezone(studentTimezone, 'UTC');
  const normalizedDurationMinutes = Number(durationMinutes || 0);
  const normalizedRequiredDays = normalizeRequiredDays(requiredDays);
  const requiredDaysKey = normalizedRequiredDays.join('|');

  if (!normalizedFamilyId || !normalizedFamilyMemberId) {
    throw new Error('familyId and familyMemberId are required.');
  }
  if (!normalizedStudentDate || !normalizedStudentTime) {
    throw new Error('studentDate and studentTime are required.');
  }
  if (!Number.isFinite(normalizedDurationMinutes) || normalizedDurationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than zero.');
  }
  if (normalizedRequiredDays.length === 0) {
    throw new Error('At least one required day is needed before sending requests.');
  }

  const requestedTeachers = [];
  for (const rawTeacherId of uniq(teacherIds)) {
    const teacher = await schedulingService.resolveTeacherRecord(rawTeacherId);
    if (teacher?.canonicalId) {
      requestedTeachers.push(teacher);
    }
  }

  if (requestedTeachers.length === 0) {
    throw new Error('Please select at least one teacher before sending requests.');
  }

  const studentEnd = normalizeTimeString(studentEndTime) || addMinutesToTime(normalizedStudentTime, normalizedDurationMinutes);
  const context = await schedulingService.resolveFamilyMemberContext(normalizedFamilyId, normalizedFamilyMemberId);
  const currentAssignment = await schedulingService.getCurrentTeacherAssignmentSummary(context).catch(() => null);
  const { candidateMap } = await loadAvailableTeacherCandidates({
    studentDate: normalizedStudentDate,
    studentTime: normalizedStudentTime,
    studentEndTime: studentEnd,
    studentTimezone: normalizedTimezone,
    durationMinutes: normalizedDurationMinutes,
    requiredDays: normalizedRequiredDays,
  });

  const availableSelections = [];
  const unavailableSelections = [];

  requestedTeachers.forEach((teacher) => {
    const teacherIdentifiers = new Set(uniq([
      teacher?.canonicalId,
      teacher?.employeeId,
      teacher?.userId,
      teacher?.uid,
    ]));
    if (currentAssignment && currentAssignment.teacherIds.some((teacherId) => teacherIdentifiers.has(teacherId))) {
      unavailableSelections.push({
        teacherId: teacher.canonicalId,
        teacherName: teacher.name,
        reason: 'already_assigned',
        assignedTeacherId: currentAssignment.assignedTeacherId,
        assignedTeacherName: currentAssignment.assignedTeacherName,
      });
      return;
    }

    const candidate = candidateMap.get(teacher.canonicalId);
    if (candidate) {
      availableSelections.push({ teacher, candidate });
    } else {
      unavailableSelections.push({
        teacherId: teacher.canonicalId,
        teacherName: teacher.name,
      });
    }
  });

  if (availableSelections.length === 0) {
    const alreadyAssignedMatch = unavailableSelections.find((selection) => selection.reason === 'already_assigned');
    const error = new Error(
      alreadyAssignedMatch
        ? `${context.studentName} is already assigned to ${alreadyAssignedMatch.assignedTeacherName || 'this teacher'}. Add classes directly instead of sending another confirmation request.`
        : 'The selected teachers are no longer available for this schedule.'
    );
    error.statusCode = 409;
    error.details = {
      unavailableTeachers: unavailableSelections,
      ...(alreadyAssignedMatch ? currentAssignment : {}),
    };
    throw error;
  }

  const openRequests = await MongoScheduleAssignmentRequest.find({
    familyId: normalizedFamilyId,
    familyMemberId: normalizedFamilyMemberId,
    studentDate: normalizedStudentDate,
    studentTime: normalizedStudentTime,
    durationMinutes: normalizedDurationMinutes,
    requiredDaysKey,
    teacherId: { $in: availableSelections.map(({ teacher }) => teacher.canonicalId) },
    status: { $in: OPEN_REQUEST_STATUSES },
  }).lean();

  const reusedByTeacherId = new Map();
  openRequests.forEach((requestDoc) => {
    if (requestDoc?.teacherId) {
      reusedByTeacherId.set(requestDoc.teacherId, requestDoc);
    }
  });

  const batchId = buildId('sar_batch');
  const insertDocs = availableSelections
    .filter(({ teacher }) => !reusedByTeacherId.has(teacher.canonicalId))
    .map(({ teacher, candidate }) => ({
      _id: buildId('sar'),
      batchId,
      familyId: normalizedFamilyId,
      familyMemberId: normalizedFamilyMemberId,
      studentId: context.studentId || null,
      studentName: context.studentName,
      teacherId: teacher.canonicalId,
      teacherUid: teacher.uid,
      teacherEmployeeId: teacher.employeeId,
      teacherName: teacher.name,
      teacherTimezone: teacher.timezone,
      teacherGender: teacher.gender,
      teacherNationality: teacher.nationality,
      teacherCategory: teacher.category,
      studentDate: normalizedStudentDate,
      studentTime: normalizedStudentTime,
      studentEndTime: studentEnd,
      studentTimezone: normalizedTimezone,
      durationMinutes: normalizedDurationMinutes,
      requiredDays: normalizedRequiredDays,
      requiredDaysKey,
      studentNeeds: String(studentNeeds || '').trim(),
      matchedDays: Array.isArray(candidate?.matchedDays) ? candidate.matchedDays : [],
      status: 'pending',
      requestedBy: String(requestedBy || 'admin').trim() || 'admin',
      requestedByName: String(requestedByName || 'Admin').trim() || 'Admin',
      requestedAt: new Date(),
      requestNote: String(requestNote || '').trim(),
      raw: {
        teacherLocal: candidate?.teacherLocal || null,
        studentLocal: candidate?.studentLocal || null,
        availabilitySource: candidate?.availabilitySource || '',
        availabilityDate: candidate?.availabilityDate || '',
        availabilityNote: candidate?.availabilityNote || '',
      },
    }));

  let createdRequests = [];
  if (insertDocs.length > 0) {
    createdRequests = await MongoScheduleAssignmentRequest.insertMany(insertDocs, { ordered: true });
  }

  const requests = [
    ...createdRequests.map((doc) => (doc?.toObject ? doc.toObject() : doc)),
    ...openRequests,
  ].sort((left, right) => String(left.teacherName || '').localeCompare(String(right.teacherName || '')));

  return {
    success: true,
    batchId,
    requests,
    createdCount: createdRequests.length,
    reusedCount: openRequests.length,
    skippedTeachers: unavailableSelections,
  };
}

async function listAssignmentRequests({
  actorRole = 'admin',
  actorId = '',
  familyId = '',
  familyMemberId = '',
  teacherId = '',
  batchId = '',
  statuses = [],
  studentDate = '',
  studentTime = '',
  durationMinutes = null,
  requiredDays = [],
  limit = 100,
}) {
  const query = {};

  if (familyId) {
    query.familyId = String(familyId).trim();
  }
  if (familyMemberId) {
    query.familyMemberId = String(familyMemberId).trim();
  }
  if (batchId) {
    query.batchId = String(batchId).trim();
  }

  const normalizedDate = normalizeDateKey(studentDate);
  if (normalizedDate) {
    query.studentDate = normalizedDate;
  }

  const normalizedTime = normalizeTimeString(studentTime);
  if (normalizedTime) {
    query.studentTime = normalizedTime;
  }

  const normalizedDuration = Number(durationMinutes);
  if (Number.isFinite(normalizedDuration) && normalizedDuration > 0) {
    query.durationMinutes = normalizedDuration;
  }

  const normalizedRequiredDays = normalizeRequiredDays(requiredDays);
  if (normalizedRequiredDays.length > 0) {
    query.requiredDaysKey = normalizedRequiredDays.join('|');
  }

  const normalizedStatuses = normalizeStatuses(statuses);
  if (normalizedStatuses.length > 0) {
    query.status = { $in: normalizedStatuses };
  }

  if (actorRole === 'teacher') {
    const teacher = await schedulingService.resolveTeacherRecord(actorId);
    query.$or = [
      { teacherId: teacher.canonicalId },
      { teacherUid: teacher.canonicalId },
      { teacherEmployeeId: teacher.employeeId },
    ];
  } else if (teacherId) {
    const teacher = await schedulingService.resolveTeacherRecord(teacherId);
    query.$or = [
      { teacherId: teacher.canonicalId },
      { teacherUid: teacher.canonicalId },
      { teacherEmployeeId: teacher.employeeId },
    ];
  }

  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 200));
  const requests = await MongoScheduleAssignmentRequest.find(query)
    .sort({ requestedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  const counts = requests.reduce((accumulator, requestDoc) => {
    const key = String(requestDoc?.status || 'pending').trim().toLowerCase() || 'pending';
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  return {
    success: true,
    requests,
    counts,
  };
}

async function respondToAssignmentRequest({
  requestId,
  teacherId,
  action,
  note = '',
}) {
  const normalizedRequestId = String(requestId || '').trim();
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!normalizedRequestId) {
    throw new Error('requestId is required.');
  }
  if (!['accept', 'accepted', 'reject', 'rejected'].includes(normalizedAction)) {
    throw new Error('action must be accept or reject.');
  }

  const requestDoc = await MongoScheduleAssignmentRequest.findById(normalizedRequestId).lean();
  if (!requestDoc) {
    throw new Error('Schedule request not found.');
  }

  const teacher = await schedulingService.resolveTeacherRecord(teacherId);
  if (!matchesTeacherRequest(requestDoc, teacher)) {
    const error = new Error('You do not have permission to respond to this request.');
    error.statusCode = 403;
    throw error;
  }

  if (requestDoc.status !== 'pending') {
    throw new Error('This schedule request has already been processed.');
  }

  const nextStatus = normalizedAction.startsWith('accept') ? 'accepted' : 'rejected';

  if (nextStatus === 'accepted') {
    const context = await schedulingService.resolveFamilyMemberContext(
      requestDoc.familyId,
      requestDoc.familyMemberId,
    ).catch(() => null);
    const currentAssignment = context
      ? await schedulingService.getCurrentTeacherAssignmentSummary(context).catch(() => null)
      : null;
    const teacherIdentifiers = new Set(uniq([
      teacher?.canonicalId,
      teacher?.employeeId,
      teacher?.userId,
      teacher?.uid,
    ]));

    if (currentAssignment && currentAssignment.teacherIds.some((teacherId) => teacherIdentifiers.has(teacherId))) {
      const error = new Error(
        `${currentAssignment.studentName} is already assigned to ${currentAssignment.assignedTeacherName}. Ask admin to add classes directly instead of re-accepting this request.`
      );
      error.statusCode = 409;
      error.details = currentAssignment;
      throw error;
    }

    const { candidateMap } = await loadAvailableTeacherCandidates({
      studentDate: requestDoc.studentDate,
      studentTime: requestDoc.studentTime,
      studentEndTime: requestDoc.studentEndTime,
      studentTimezone: requestDoc.studentTimezone,
      durationMinutes: requestDoc.durationMinutes,
      requiredDays: requestDoc.requiredDays,
    });

    if (!candidateMap.has(teacher.canonicalId)) {
      const error = new Error('This schedule request can no longer be accepted because the selected time is no longer free in your schedule.');
      error.statusCode = 409;
      throw error;
    }
  }

  const respondedAt = new Date();
  await MongoScheduleAssignmentRequest.updateOne(
    { _id: normalizedRequestId },
    {
      $set: {
        status: nextStatus,
        teacherResponseNote: String(note || '').trim(),
        respondedAt,
      },
    }
  );

  const updatedRequest = await MongoScheduleAssignmentRequest.findById(normalizedRequestId).lean();
  await createAdminAlertForRequestResponse(updatedRequest, nextStatus);

  return {
    success: true,
    request: updatedRequest,
  };
}

async function finalizeAssignmentRequest({
  requestId,
  finalizedBy = 'admin',
}) {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) {
    throw new Error('requestId is required.');
  }

  const requestDoc = await MongoScheduleAssignmentRequest.findById(normalizedRequestId).lean();
  if (!requestDoc) {
    throw new Error('Schedule request not found.');
  }
  if (requestDoc.status !== 'accepted') {
    throw new Error('Only accepted teacher requests can be finalized.');
  }

  const memberCandidates = uniq([
    requestDoc.familyMemberId,
    requestDoc.studentId,
  ]);
  let resolvedContext = null;
  let lastResolutionError = null;
  for (const candidate of memberCandidates) {
    try {
      resolvedContext = await schedulingService.resolveFamilyMemberContext(
        requestDoc.familyId,
        candidate,
      );
      if (resolvedContext?.member?._id) {
        break;
      }
    } catch (error) {
      lastResolutionError = error;
    }
  }

  if (!resolvedContext?.member?._id) {
    if (lastResolutionError) {
      throw lastResolutionError;
    }
    throw new Error('Family member not found for this schedule request.');
  }

  const resolvedFamilyMemberId = pickFirstString(
    resolvedContext.member._id,
    requestDoc.familyMemberId,
    requestDoc.studentId,
  );
  const resolvedStudentId = pickFirstString(
    resolvedContext.studentId,
    requestDoc.studentId,
    resolvedContext.member.uid,
    resolvedContext.member.studentId,
  );
  const resolvedStudentName = pickFirstString(
    resolvedContext.studentName,
    requestDoc.studentName,
  );

  const result = await schedulingService.assignTeacherSchedule({
    teacherId: requestDoc.teacherId,
    familyId: requestDoc.familyId,
    familyMemberId: resolvedFamilyMemberId,
    studentDate: requestDoc.studentDate,
    studentTime: requestDoc.studentTime,
    studentEndTime: requestDoc.studentEndTime,
    studentTimezone: requestDoc.studentTimezone,
    durationMinutes: requestDoc.durationMinutes,
    requiredDays: requestDoc.requiredDays,
    studentNeeds: requestDoc.studentNeeds,
    assignedBy: String(finalizedBy || 'admin').trim() || 'admin',
    bookingSource: 'schedule_assignment_request',
  });

  const finalBookingIds = Array.isArray(result?.bookings)
    ? result.bookings.map((booking) => pickFirstString(booking?._id, booking?.id)).filter(Boolean)
    : [];

  const finalizedAt = new Date();
  await MongoScheduleAssignmentRequest.updateOne(
    { _id: normalizedRequestId },
    {
      $set: {
        status: 'finalized',
        finalizedAt,
        finalizedBy: String(finalizedBy || 'admin').trim() || 'admin',
        finalBookingIds,
        familyMemberId: resolvedFamilyMemberId,
        studentId: resolvedStudentId || null,
        studentName: resolvedStudentName || requestDoc.studentName || '',
      },
    }
  );

  if (requestDoc.batchId) {
    await MongoScheduleAssignmentRequest.updateMany(
      {
        batchId: requestDoc.batchId,
        _id: { $ne: normalizedRequestId },
        status: { $in: OPEN_REQUEST_STATUSES },
      },
      {
        $set: {
          status: 'superseded',
          finalizedAt,
          finalizedBy: String(finalizedBy || 'admin').trim() || 'admin',
        },
      }
    );
  }

  const updatedRequest = await MongoScheduleAssignmentRequest.findById(normalizedRequestId).lean();

  return {
    success: true,
    request: updatedRequest,
    teacher: result.teacher,
    requestedDays: result.requestedDays,
    bookings: result.bookings,
    matchedDays: result.matchedDays,
  };
}

module.exports = {
  createAssignmentRequests,
  finalizeAssignmentRequest,
  listAssignmentRequests,
  respondToAssignmentRequest,
};
