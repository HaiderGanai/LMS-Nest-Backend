const { connectMongo } = require('../db');
const CallRecording = require('../models/CallRecording');
const Violation = require('../models/Violation');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

async function listRecordingsMongo(limit = 50) {
  await ensureMongoConnected();
  const docs = await CallRecording.find({})
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
  return docs.map((doc) => ({
    id: doc._id,
    ...doc,
  }));
}

async function listRecordingsFirebase(firestore, limit = 50) {
  if (!firestore) throw new Error('Firestore not configured');
  const snapshot = await firestore.collection('callRecordings')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const out = [];
  snapshot.forEach((doc) => out.push({ id: doc.id, ...doc.data() }));
  return out;
}

async function getRecordingDetailsMongo(callId) {
  await ensureMongoConnected();
  const rec = await CallRecording.findById(callId).lean();
  if (!rec) return null;
  const violations = await Violation.find({ $or: [{ callId }, { recordingId: callId }] }).lean();
  return {
    id: rec._id,
    data: rec,
    violations: violations.map((v) => ({ id: v._id, ...v })),
  };
}

async function getRecordingDetailsFirebase(firestore, callId) {
  if (!firestore) throw new Error('Firestore not configured');
  const doc = await firestore.collection('callRecordings').doc(callId).get();
  if (!doc.exists) return null;
  const violations = await doc.ref.collection('violations').get();
  const violationsList = violations.docs.map((v) => ({ id: v.id, ...v.data() }));
  return {
    id: doc.id,
    data: doc.data() || {},
    violations: violationsList,
    docRef: doc.ref,
  };
}

async function listRecordings({ firestore, dataBackend, limit }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return listRecordingsMongo(limit);
  }
  return listRecordingsFirebase(firestore, limit);
}

async function getRecordingDetails({ firestore, dataBackend, callId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getRecordingDetailsMongo(callId);
  }
  return getRecordingDetailsFirebase(firestore, callId);
}

module.exports = {
  listRecordings,
  getRecordingDetails,
};
