const { connectMongo } = require('../db');
const Student = require('../models/Student');
const User = require('../models/User');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

function asProfile(id, data, source) {
  return { id, data, source };
}

async function getStudentProfileMongo(studentId) {
  await ensureMongoConnected();

  const studentDoc = await Student.findById(studentId).lean();
  if (studentDoc) return asProfile(studentDoc._id, studentDoc, 'mongo:students');

  const userDoc = await User.findById(studentId).lean();
  if (userDoc) return asProfile(userDoc._id, userDoc, 'mongo:users');

  return null;
}

async function getStudentProfileFirebase(firestore, studentId) {
  if (!firestore) return null;

  const studentDoc = await firestore.collection('students').doc(studentId).get();
  if (studentDoc.exists) return asProfile(studentDoc.id, studentDoc.data(), 'firebase:students');

  const userDoc = await firestore.collection('users').doc(studentId).get();
  if (userDoc.exists) return asProfile(userDoc.id, userDoc.data(), 'firebase:users');

  return null;
}

async function getStudentProfile({ firestore, dataBackend, studentId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();

  if (backend === 'mongo') {
    return getStudentProfileMongo(studentId);
  }

  return getStudentProfileFirebase(firestore, studentId);
}

module.exports = {
  getStudentProfile,
};
