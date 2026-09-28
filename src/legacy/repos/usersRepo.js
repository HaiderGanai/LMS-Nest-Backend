const { connectMongo } = require('../db');
const User = require('../models/User');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

async function getUserByIdMongo(userId) {
  await ensureMongoConnected();
  const doc = await User.findById(userId).lean();
  if (!doc) return null;
  return {
    id: doc._id,
    data: doc,
    source: 'mongo',
  };
}

async function getUserByIdFirebase(firestore, userId) {
  if (!firestore) return null;
  const snap = await firestore.collection('users').doc(userId).get();
  if (!snap.exists) return null;
  return {
    id: snap.id,
    data: snap.data(),
    source: 'firebase',
  };
}

async function getUserById({ firestore, dataBackend, userId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();

  if (backend === 'mongo') {
    return getUserByIdMongo(userId);
  }

  return getUserByIdFirebase(firestore, userId);
}

module.exports = {
  getUserById,
};
