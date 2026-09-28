/* eslint-disable no-console */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

function getMongoConfig() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGO_DB_NAME || 'tarteel_v2';
  const maxPoolSize = Number(process.env.MONGO_MAX_POOL || 20);
  return { mongoUri, dbName, maxPoolSize };
}

function isoNow() {
  return new Date().toISOString();
}

function asDate(value) {
  return new Date(value);
}

async function upsertById(collectionName, doc) {
  const collection = mongoose.connection.collection(collectionName);
  await collection.updateOne(
    { _id: doc._id },
    { $set: doc },
    { upsert: true },
  );
}

async function seedAuthAndUsers(passwordHashes) {
  const users = [
    {
      _id: 'admin_1',
      role: 'admin',
      email: 'admin@example.com',
      name: 'Admin User',
      username: 'admin',
      isActive: true,
      isOnline: false,
      raw: { clientApp: 'lms' },
    },
    {
      _id: 'emp_1001',
      role: 'teacher',
      email: 'teacher@example.com',
      name: 'Teacher One',
      username: 'teacher1',
      isActive: true,
      isOnline: false,
      raw: { clientApp: 'teacher-app' },
    },
    {
      _id: 'emp_1002',
      role: 'teacher',
      email: 'teacher2@example.com',
      name: 'Teacher Two',
      username: 'teacher2',
      isActive: true,
      isOnline: false,
      raw: { clientApp: 'teacher-app' },
    },
    {
      _id: 'parent_1001',
      role: 'parent',
      email: 'parent@example.com',
      name: 'Parent One',
      username: 'parent1',
      isActive: true,
      isOnline: false,
      activeStudentId: 'stu_1001',
      children: [
        {
          studentId: 'stu_1001',
          name: 'Student One',
          email: 'student@example.com',
          assignedTeacher: 'emp_1001',
          studentStatus: 'active',
          isOnline: false,
        },
      ],
      raw: { clientApp: 'parent-app' },
    },
    {
      _id: 'stu_1001',
      role: 'student',
      email: 'student@example.com',
      name: 'Student One',
      username: 'student1',
      isActive: true,
      isOnline: false,
      raw: { clientApp: 'student-app', parentId: 'parent_1001' },
    },
  ];

  for (const user of users) {
    await upsertById('users', user);
  }

  const credentials = [
    {
      _id: 'admin@example.com',
      email: 'admin@example.com',
      userId: 'admin_1',
      role: 'admin',
      name: 'Admin User',
      password: 'admin-password',
      passwordHash: passwordHashes.admin,
      isActive: true,
      disabled: false,
      raw: {},
    },
    {
      _id: 'teacher@example.com',
      email: 'teacher@example.com',
      userId: 'emp_1001',
      role: 'teacher',
      name: 'Teacher One',
      password: 'teacher-password',
      passwordHash: passwordHashes.teacher,
      isActive: true,
      disabled: false,
      raw: {},
    },
    {
      _id: 'teacher2@example.com',
      email: 'teacher2@example.com',
      userId: 'emp_1002',
      role: 'teacher',
      name: 'Teacher Two',
      password: 'teacher2-password',
      passwordHash: passwordHashes.teacher2,
      isActive: true,
      disabled: false,
      raw: {},
    },
    {
      _id: 'parent@example.com',
      email: 'parent@example.com',
      userId: 'parent_1001',
      role: 'parent',
      name: 'Parent One',
      password: 'parent-password',
      passwordHash: passwordHashes.parent,
      isActive: true,
      disabled: false,
      raw: {},
    },
    {
      _id: 'student@example.com',
      email: 'student@example.com',
      userId: 'stu_1001',
      role: 'student',
      name: 'Student One',
      password: 'student-password',
      passwordHash: passwordHashes.student,
      isActive: true,
      disabled: false,
      raw: {},
    },
  ];

  for (const credential of credentials) {
    await upsertById('localAuthCredentials', credential);
  }
}

function buildTeacherScheduleHours() {
  return [
    { day: 'monday', startTime: '09:00', endTime: '18:00' },
    { day: 'tuesday', startTime: '09:00', endTime: '18:00' },
    { day: 'wednesday', startTime: '09:00', endTime: '18:00' },
    { day: 'thursday', startTime: '09:00', endTime: '18:00' },
    { day: 'friday', startTime: '09:00', endTime: '18:00' },
  ];
}

async function seedPeopleAndScheduling() {
  const teacherHours = buildTeacherScheduleHours();

  const employees = [
    {
      _id: 'admin_1',
      uid: 'admin_1',
      email: 'admin@example.com',
      name: 'Admin User',
      designation: 'admin',
      role: 'admin',
      status: 'active',
      isActive: true,
      raw: {},
    },
    {
      _id: 'emp_1001',
      uid: 'emp_1001',
      email: 'teacher@example.com',
      name: 'Teacher One',
      designation: 'teacher',
      role: 'teacher',
      status: 'active',
      isActive: true,
      raw: {
        timezone: 'Asia/Karachi',
        scheduledHours: teacherHours,
        gender: 'female',
        nationality: 'Pakistani',
        category: 'tajweed',
      },
    },
    {
      _id: 'emp_1002',
      uid: 'emp_1002',
      email: 'teacher2@example.com',
      name: 'Teacher Two',
      designation: 'teacher',
      role: 'teacher',
      status: 'active',
      isActive: true,
      raw: {
        timezone: 'Asia/Karachi',
        scheduledHours: teacherHours,
        gender: 'male',
        nationality: 'Pakistani',
        category: 'hifz',
      },
    },
  ];

  for (const employee of employees) {
    await upsertById('employees', employee);
  }

  await upsertById('students', {
    _id: 'stu_1001',
    studentId: 'stu_1001',
    parentId: 'parent_1001',
    teacherId: 'emp_1001',
    assignedTeacher: 'emp_1001',
    name: 'Student One',
    email: 'student@example.com',
    studentStatus: 'active',
    isOnline: false,
    raw: {
      timezone: 'Asia/Karachi',
      preferredClassDays: ['monday', 'tuesday'],
      preferredStartTime: '10:00',
    },
  });

  await upsertById('families', {
    _id: 'fam_1001',
    parentUid: 'parent_1001',
    parentEmail: 'parent@example.com',
    status: 'active',
    name: 'Family One',
    raw: {},
  });

  await upsertById('familyMembers', {
    _id: 'member_1001',
    familyId: 'fam_1001',
    uid: 'stu_1001',
    studentId: 'stu_1001',
    role: 'student',
    status: 'active',
    raw: {
      studentName: 'Student One',
      timezone: 'Asia/Karachi',
      assignedTeacher: 'emp_1001',
      assignedTeacherName: 'Teacher One',
    },
  });

  await upsertById('schedule_availability', {
    _id: 'emp_1001:2026-04-20',
    teacherId: 'emp_1001',
    teacherUid: 'emp_1001',
    teacherName: 'Teacher One',
    timezone: 'Asia/Karachi',
    date: '2026-04-20',
    ranges: [
      { id: 'range_1001', startTime: '09:00', endTime: '18:00', endDayOffset: 0 },
    ],
    breaks: [
      { id: 'br_1001', startTime: '11:00', endTime: '11:15', endDayOffset: 0 },
    ],
    notes: 'Seeded availability',
    raw: {},
  });

  await upsertById('schedule_availability', {
    _id: 'emp_1002:2026-04-20',
    teacherId: 'emp_1002',
    teacherUid: 'emp_1002',
    teacherName: 'Teacher Two',
    timezone: 'Asia/Karachi',
    date: '2026-04-20',
    ranges: [
      { id: 'range_2001', startTime: '09:00', endTime: '18:00', endDayOffset: 0 },
    ],
    breaks: [],
    notes: 'Seeded availability',
    raw: {},
  });

  await upsertById('schedule_bookings', {
    _id: 'book_1001',
    teacherId: 'emp_1001',
    teacherUid: 'emp_1001',
    teacherEmployeeId: 'emp_1001',
    teacherName: 'Teacher One',
    teacherTimezone: 'Asia/Karachi',
    familyId: 'fam_1001',
    familyMemberId: 'member_1001',
    studentId: 'stu_1001',
    studentName: 'Student One',
    studentTimezone: 'Asia/Karachi',
    startUtc: asDate('2026-04-22T05:30:00.000Z'),
    endUtc: asDate('2026-04-22T06:00:00.000Z'),
    durationMinutes: 30,
    status: 'booked',
    bookingSource: 'seed',
    anchorType: 'student_local',
    studentLocalDate: '2026-04-22',
    studentLocalStartTime: '10:30',
    studentLocalEndTime: '11:00',
    teacherLocalDate: '2026-04-22',
    teacherLocalStartTime: '10:30',
    teacherLocalEndTime: '11:00',
    businessTimezone: 'Asia/Karachi',
    businessDate: '2026-04-22',
    businessMonthKey: '2026-04',
    assignedBy: 'admin_1',
    adminNote: 'Seed booking',
    raw: {},
  });

  await upsertById('schedule_assignment_requests', {
    _id: 'req_1001',
    batchId: 'batch_1001',
    familyId: 'fam_1001',
    familyMemberId: 'member_1001',
    studentId: 'stu_1001',
    studentName: 'Student One',
    teacherId: 'emp_1001',
    teacherUid: 'emp_1001',
    teacherEmployeeId: 'emp_1001',
    teacherName: 'Teacher One',
    teacherTimezone: 'Asia/Karachi',
    studentDate: '2026-04-23',
    studentTime: '09:00',
    studentEndTime: '09:30',
    studentTimezone: 'Asia/Karachi',
    durationMinutes: 30,
    requiredDays: ['thursday'],
    requiredDaysKey: 'thursday',
    studentNeeds: 'Quran recitation',
    status: 'pending',
    requestedBy: 'admin_1',
    requestedByName: 'Admin User',
    requestedAt: new Date(),
    requestNote: 'Seed assignment request',
    raw: {},
  });
}

async function seedCommunicationAndAlerts() {
  await upsertById('conversations', {
    _id: 'conv_1',
    id: 'conv_1',
    participants: ['parent_1001', 'emp_1001'],
    participantRoles: ['parent', 'teacher'],
    participantNames: ['Parent One', 'Teacher One'],
    unreadCount: { parent_1001: 0, emp_1001: 1 },
    lastMessage: 'Hello teacher',
    lastMessageTime: asDate('2026-04-15T10:00:00.000Z'),
    raw: {},
  });

  await upsertById('messages', {
    _id: 'msg_1001',
    conversationId: 'conv_1',
    senderId: 'parent_1001',
    receiverId: 'emp_1001',
    participants: ['parent_1001', 'emp_1001'],
    content: 'Hello teacher',
    text: 'Hello teacher',
    type: 'text',
    senderName: 'Parent One',
    receiverName: 'Teacher One',
    senderRole: 'parent',
    receiverRole: 'teacher',
    isRead: false,
    read: false,
    seenByAdmin: false,
    timestamp: asDate('2026-04-15T10:00:00.000Z'),
    metadata: {},
    raw: {},
  });

  await upsertById('announcements', {
    _id: 'ann_1001',
    title: 'Welcome',
    body: 'Welcome to the LMS test environment.',
    targetAudience: 'all',
    active: true,
    createdBy: 'admin_1',
    createdAt: asDate('2026-04-10T09:00:00.000Z'),
    raw: {},
  });

  await upsertById('call_alerts', {
    _id: 'alert_1001',
    callId: 'call_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    type: 'safety',
    read: false,
    timestamp: asDate('2026-04-16T09:30:00.000Z'),
    raw: { status: 'new', message: 'Seed call alert' },
  });

  await upsertById('video_alerts', {
    _id: 'video_alert_1001',
    callId: 'call_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    alertType: 'video',
    read: false,
    createdAt: asDate('2026-04-16T09:35:00.000Z'),
    raw: { severity: 'medium', message: 'Seed video alert' },
  });

  await upsertById('message_alerts', {
    _id: 'm_alert_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    conversationId: 'conv_1',
    messageId: 'msg_1001',
    pattern: 'abuse',
    patternMatched: 'dummy',
    content: 'Hello teacher',
    messageContent: 'Hello teacher',
    severity: 'low',
    resolved: false,
    timestamp: asDate('2026-04-16T09:40:00.000Z'),
    raw: { status: 'open' },
  });
}

async function seedCallsRecordingsAndTelemetry() {
  await upsertById('calls', {
    _id: 'call_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    roomId: 'room_1001',
    janusRoomId: 1001,
    status: 'ongoing',
    startedAt: asDate('2026-04-16T09:00:00.000Z'),
    raw: {},
  });

  await upsertById('call_telemetry_events', {
    _id: 'telemetry_1001',
    callId: 'call_1001',
    roomId: 'room_1001',
    janusRoomId: 1001,
    actorRole: 'teacher',
    actorId: 'emp_1001',
    app: 'teacher',
    platform: 'web',
    eventType: 'connection-quality',
    severity: 'info',
    category: 'network',
    message: 'Seed telemetry event',
    data: { rttMs: 85, packetLoss: 0.02 },
    eventAt: asDate('2026-04-16T09:05:00.000Z'),
  });

  await upsertById('callRecordings', {
    _id: 'rec_1001',
    callId: 'call_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    roomId: 'room_1001',
    janusRoomId: 1001,
    status: 'processed',
    startedAt: asDate('2026-04-16T09:00:00.000Z'),
    endedAt: asDate('2026-04-16T09:30:00.000Z'),
    createdAt: asDate('2026-04-16T09:31:00.000Z'),
    processedAt: asDate('2026-04-16T09:40:00.000Z'),
    playbackUrl: 'https://example.com/recordings/call_1001.webm',
    playbackFileName: 'call_1001.webm',
    playbackSizeBytes: 1024000,
    rawFileCount: 3,
    rawAudioCount: 1,
    rawVideoCount: 1,
    rawSizeBytes: 2048000,
    playbackVariants: {},
    raw: {},
  });

  await upsertById('processingQueue', {
    _id: 'call_1001',
    callId: 'call_1001',
    roomId: 'room_1001',
    janusRoomId: 1001,
    status: 'completed',
    queuedAt: asDate('2026-04-16T09:31:00.000Z'),
    processedAt: asDate('2026-04-16T09:40:00.000Z'),
    raw: {},
  });

  await upsertById('flagged_transcripts', {
    _id: 'flagged_1001',
    callId: 'call_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    severity: 'high',
    timestamp: asDate('2026-04-16T09:15:00.000Z'),
    createdAt: asDate('2026-04-16T09:15:00.000Z'),
    text: 'Potential flagged sentence',
    raw: {},
  });
}

async function seedFinanceAndHr() {
  await upsertById('invoices', {
    _id: 'inv_1001',
    familyId: 'fam_1001',
    month: '2026-04',
    year: 2026,
    status: 'pending',
    amount: 120.5,
    totalAmount: 120.5,
    paidAmount: 0,
    monthKey: '2026-04',
    dueDate: asDate('2026-04-30T23:59:59.000Z'),
    raw: {},
  });

  await upsertById('payments', {
    _id: 'pay_1001',
    invoiceId: 'inv_1001',
    familyId: 'fam_1001',
    amount: 120.5,
    method: 'manual',
    status: 'completed',
    raw: {},
  });

  await upsertById('class_hours', {
    _id: 'ch_1001',
    familyId: 'fam_1001',
    studentId: 'stu_1001',
    teacherId: 'emp_1001',
    date: asDate('2026-04-01T00:00:00.000Z'),
    hours: 12,
    month: '2026-04',
    monthKey: '2026-04',
    raw: {},
  });

  await upsertById('salaries', {
    _id: 'sal_1001',
    employeeId: 'emp_1001',
    month: '2026-04',
    year: 2026,
    amount: 2500,
    grossAmount: 2500,
    netAmount: 2500,
    status: 'pending',
    raw: {},
  });

  await upsertById('salary_advances', {
    _id: 'adv_1001',
    employeeId: 'emp_1001',
    amount: 400,
    status: 'pending',
    monthKey: '2026-04',
    raw: {},
  });

  await upsertById('teacher_complaints', {
    _id: 'cmp_1001',
    teacherId: 'emp_1001',
    studentId: 'stu_1001',
    description: 'Behavior issue',
    category: 'behavior',
    severity: 'medium',
    status: 'open',
    resolved: false,
    raw: {},
  });
}

async function run() {
  const { mongoUri, dbName, maxPoolSize } = getMongoConfig();
  const startedAt = isoNow();

  console.log(`[seed] connecting to ${mongoUri} (db: ${dbName})`);
  await mongoose.connect(mongoUri, { dbName, maxPoolSize });

  try {
    const passwordHashes = {
      admin: await bcrypt.hash('admin-password', 10),
      teacher: await bcrypt.hash('teacher-password', 10),
      teacher2: await bcrypt.hash('teacher2-password', 10),
      parent: await bcrypt.hash('parent-password', 10),
      student: await bcrypt.hash('student-password', 10),
    };

    await seedAuthAndUsers(passwordHashes);
    await seedPeopleAndScheduling();
    await seedCommunicationAndAlerts();
    await seedCallsRecordingsAndTelemetry();
    await seedFinanceAndHr();

    console.log('[seed] done');
    console.log('[seed] test credentials:');
    console.log('  admin   -> admin@example.com / admin-password');
    console.log('  teacher -> teacher@example.com / teacher-password');
    console.log('  teacher -> teacher2@example.com / teacher2-password');
    console.log('  parent  -> parent@example.com / parent-password');
    console.log('  student -> student@example.com / student-password');
    console.log(`[seed] started: ${startedAt}`);
    console.log(`[seed] ended:   ${isoNow()}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[seed] failed:', error);
  process.exitCode = 1;
});
