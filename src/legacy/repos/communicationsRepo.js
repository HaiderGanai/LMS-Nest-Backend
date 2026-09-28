const { connectMongo } = require('../db');
const Student = require('../models/Student');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

async function resolveParticipantIdMongo(studentId) {
  await ensureMongoConnected();
  const studentDoc = await Student.findById(studentId).lean();
  if (studentDoc) {
    return studentDoc.parentId || studentId;
  }
  const userDoc = await User.findById(studentId).lean();
  if (userDoc) return studentId;
  return studentId;
}

async function resolveParticipantIdFirebase(firestore, studentId) {
  if (!firestore) return studentId;
  const studentDoc = await firestore.collection('students').doc(studentId).get();
  if (studentDoc.exists) {
    const data = studentDoc.data() || {};
    return data.parentId || studentId;
  }
  return studentId;
}

async function getStudentMessagesMongo(studentId, limit = 50) {
  const participantId = await resolveParticipantIdMongo(studentId);
  const docs = await Message.find({
    $or: [
      { participants: participantId },
      { senderId: participantId },
      { receiverId: participantId },
    ],
  })
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    participantId,
    messages: docs.map((doc) => ({
      id: doc._id,
      ...doc,
      timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
    })),
  };
}

async function getStudentMessagesFirebase(firestore, studentId, limit = 50) {
  if (!firestore) throw new Error('Firestore not configured');
  const participantId = await resolveParticipantIdFirebase(firestore, studentId);
  const snapshot = await firestore
    .collection('messages')
    .where('participants', 'array-contains', participantId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const messages = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    messages.push({
      id: doc.id,
      ...data,
      timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
    });
  });
  return { participantId, messages };
}

async function getStudentConversationsMongo(studentId) {
  const participantId = await resolveParticipantIdMongo(studentId);
  const docs = await Conversation.find({ participants: participantId })
    .sort({ lastMessageTime: -1, updatedAt: -1 })
    .lean();

  return {
    participantId,
    conversations: docs.map((doc) => ({
      id: doc._id,
      ...doc,
      lastMessageTime:
        doc.lastMessageTime instanceof Date ? doc.lastMessageTime.toISOString() : doc.lastMessageTime,
    })),
  };
}

async function getStudentConversationsFirebase(firestore, studentId) {
  if (!firestore) throw new Error('Firestore not configured');
  const participantId = await resolveParticipantIdFirebase(firestore, studentId);
  const snapshot = await firestore
    .collection('conversations')
    .where('participants', 'array-contains', participantId)
    .orderBy('lastMessageTime', 'desc')
    .get();

  const conversations = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    conversations.push({
      id: doc.id,
      ...data,
      lastMessageTime: data.lastMessageTime?.toDate?.()?.toISOString() || data.lastMessageTime,
    });
  });
  return { participantId, conversations };
}

async function getStudentMessages({ firestore, dataBackend, studentId, limit }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getStudentMessagesMongo(studentId, limit);
  }
  return getStudentMessagesFirebase(firestore, studentId, limit);
}

async function getStudentConversations({ firestore, dataBackend, studentId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getStudentConversationsMongo(studentId);
  }
  return getStudentConversationsFirebase(firestore, studentId);
}

async function getConversationMessagesMongo(conversationId) {
  await ensureMongoConnected();
  const docs = await Message.find({ conversationId })
    .sort({ timestamp: 1, createdAt: 1 })
    .lean();

  return docs.map((doc) => ({
    id: doc._id,
    ...doc,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
  }));
}

async function getConversationMessagesFirebase(firestore, conversationId) {
  if (!firestore) throw new Error('Firestore not configured');
  const snapshot = await firestore
    .collection('messages')
    .where('conversationId', '==', conversationId)
    .orderBy('timestamp', 'asc')
    .get();

  const messages = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    messages.push({
      id: doc.id,
      ...data,
      timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
    });
  });
  return messages;
}

async function getConversationMessages({ firestore, dataBackend, conversationId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getConversationMessagesMongo(conversationId);
  }
  return getConversationMessagesFirebase(firestore, conversationId);
}

module.exports = {
  getStudentMessages,
  getStudentConversations,
  getConversationMessages,
};
