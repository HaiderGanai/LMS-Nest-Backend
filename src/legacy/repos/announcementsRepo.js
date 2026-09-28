const { connectMongo } = require('../db');
const Announcement = require('../models/Announcement');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

async function getLatestAnnouncementsMongo(limit = 20) {
  await ensureMongoConnected();
  const docs = await Announcement.find({})
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();

  return docs.map((doc) => ({
    id: doc._id,
    ...doc,
  }));
}

async function getLatestAnnouncementsFirebase(firestore, limit = 20) {
  if (!firestore) {
    throw new Error('Firestore not configured');
  }

  const snapshot = await firestore
    .collection('announcements')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const announcements = [];
  snapshot.forEach((doc) => {
    announcements.push({
      id: doc.id,
      ...doc.data(),
    });
  });
  return announcements;
}

async function getLatestAnnouncements({ firestore, dataBackend, limit = 20 }) {
  const backend = (dataBackend || 'firebase').toLowerCase();

  if (backend === 'mongo') {
    return getLatestAnnouncementsMongo(limit);
  }

  return getLatestAnnouncementsFirebase(firestore, limit);
}

module.exports = {
  getLatestAnnouncements,
};
