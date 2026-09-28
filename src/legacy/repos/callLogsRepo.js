const { connectMongo } = require('../db');
const Call = require('../models/Call');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

async function getStudentCallLogsMongo(studentId, limit = 10, offset = 0) {
  await ensureMongoConnected();
  const docs = await Call.find({ studentId })
    .sort({ startTime: -1, startedAt: -1, createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  return docs.map((doc) => ({
    id: doc._id,
    ...doc,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    startTime: doc.startTime instanceof Date ? doc.startTime.toISOString() : doc.startTime,
    endTime: doc.endTime instanceof Date ? doc.endTime.toISOString() : doc.endTime,
  }));
}

async function getStudentCallLogsFirebase(firestore, studentId, limit = 10, offset = 0) {
  if (!firestore) throw new Error('Firestore not configured');

  const query = firestore
    .collection('calls')
    .where('studentId', '==', studentId)
    .orderBy('startTime', 'desc')
    .limit(limit + offset);
  const snapshot = await query.get();
  const docs = offset > 0 ? snapshot.docs.slice(offset) : snapshot.docs;

  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      startTime: data.startTime?.toDate?.()?.toISOString() || data.startTime,
      endTime: data.endTime?.toDate?.()?.toISOString() || data.endTime,
    };
  });
}

async function getStudentCallLogs({ firestore, dataBackend, studentId, limit, offset }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getStudentCallLogsMongo(studentId, limit, offset);
  }
  return getStudentCallLogsFirebase(firestore, studentId, limit, offset);
}

async function getStudentStatisticsMongo(studentId) {
  await ensureMongoConnected();
  const all = await Call.find({ studentId }).lean();
  const totalCalls = all.length;

  const completedStatuses = new Set(['ended', 'completed']);
  const completedCalls = all.filter((c) => completedStatuses.has(String(c.status || '').toLowerCase()));
  const rejectedCalls = all.filter((c) => String(c.status || '').toLowerCase() === 'rejected').length;
  const failedCalls = all.filter((c) => String(c.status || '').toLowerCase() === 'failed').length;

  const successRate = totalCalls > 0 ? Math.round((completedCalls.length / totalCalls) * 100) : 0;

  const recentCompleted = completedCalls
    .sort((a, b) => {
      const sa = a.startTime ? new Date(a.startTime).getTime() : 0;
      const sb = b.startTime ? new Date(b.startTime).getTime() : 0;
      return sb - sa;
    })
    .slice(0, 100);

  let totalDuration = 0;
  for (const c of recentCompleted) {
    totalDuration += Number(c.duration || 0);
  }
  const averageDuration = recentCompleted.length > 0
    ? Math.round(totalDuration / recentCompleted.length)
    : 0;

  return {
    totalCalls,
    successfulCalls: completedCalls.length,
    rejectedCalls,
    failedCalls,
    successRate,
    totalDuration,
    averageDuration,
    totalRecordingSize: 0,
  };
}

async function getStudentStatisticsFirebase(firestore, studentId) {
  if (!firestore) throw new Error('Firestore not configured');

  const baseQuery = firestore.collection('calls').where('studentId', '==', studentId);
  const [totalResult, completedResult, rejectedResult, failedResult] = await Promise.all([
    baseQuery.count().get(),
    baseQuery.where('status', 'in', ['ended', 'completed']).count().get(),
    baseQuery.where('status', '==', 'rejected').count().get(),
    baseQuery.where('status', '==', 'failed').count().get(),
  ]);

  const totalCalls = totalResult.data().count || 0;
  const completedCalls = completedResult.data().count || 0;
  const rejectedCalls = rejectedResult.data().count || 0;
  const failedCalls = failedResult.data().count || 0;
  const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

  let totalDuration = 0;
  let averageDuration = 0;
  if (totalCalls > 0) {
    const recentCalls = await baseQuery
      .where('status', 'in', ['ended', 'completed'])
      .orderBy('startTime', 'desc')
      .limit(100)
      .get();
    recentCalls.forEach((doc) => {
      totalDuration += Number(doc.data().duration || 0);
    });
    if (!recentCalls.empty) {
      averageDuration = Math.round(totalDuration / recentCalls.size);
    }
  }

  return {
    totalCalls,
    successfulCalls: completedCalls,
    rejectedCalls,
    failedCalls,
    successRate,
    totalDuration,
    averageDuration,
    totalRecordingSize: 0,
  };
}

async function getStudentStatistics({ firestore, dataBackend, studentId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getStudentStatisticsMongo(studentId);
  }
  return getStudentStatisticsFirebase(firestore, studentId);
}

module.exports = {
  getStudentCallLogs,
  getStudentStatistics,
};
