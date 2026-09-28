const mongoose = require('mongoose');
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

async function resolvePartyMongo(userId, displayName) {
  await ensureMongoConnected();
  const studentDoc = await Student.findById(userId).lean();
  if (studentDoc && studentDoc.parentId) {
    return {
      actualId: studentDoc.parentId,
      actualName: `${displayName || userId} (via ${studentDoc.name || userId})`,
      viaStudent: true,
    };
  }
  return {
    actualId: userId,
    actualName: displayName || userId,
    viaStudent: false,
  };
}

async function resolvePartyFirebase(firestore, userId, displayName) {
  if (!firestore) {
    return { actualId: userId, actualName: displayName || userId, viaStudent: false };
  }
  const studentDoc = await firestore.collection('students').doc(userId).get();
  if (studentDoc.exists) {
    const data = studentDoc.data() || {};
    if (data.parentId) {
      return {
        actualId: data.parentId,
        actualName: `${displayName || userId} (via ${data.name || userId})`,
        viaStudent: true,
      };
    }
  }
  return { actualId: userId, actualName: displayName || userId, viaStudent: false };
}

async function sendMessageMongo({
  senderId,
  receiverId,
  content,
  senderName,
  receiverName,
  senderRole,
  receiverRole,
  type = 'text',
}) {
  await ensureMongoConnected();
  const sender = await resolvePartyMongo(senderId, senderName);
  const receiver = await resolvePartyMongo(receiverId, receiverName);

  const actualSenderId = sender.actualId;
  const actualReceiverId = receiver.actualId;
  const actualSenderName = sender.actualName;
  const actualReceiverName = receiver.actualName;

  // Use raw (unconverted) IDs for conversationId so student sub-profiles
  // get their own per-student conversation threads.
  // actualSenderId/actualReceiverId (parent IDs) are kept only for WebSocket room delivery.
  const participants = [senderId, receiverId].sort();
  const conversationId = participants.join('_');
  const roleById = { [senderId]: senderRole, [receiverId]: receiverRole };
  const nameById = { [senderId]: actualSenderName, [receiverId]: actualReceiverName };
  const participantRoles = participants.map((id) => roleById[id] || 'user');
  const participantNames = participants.map((id) => nameById[id] || id);

  const conversationDoc = await Conversation.findById(conversationId).lean();
  const unreadCount = { ...(conversationDoc?.unreadCount || {}) };
  participants.forEach((participantId) => {
    if (participantId !== senderId) {
      unreadCount[participantId] = Number(unreadCount[participantId] || 0) + 1;
    } else if (unreadCount[participantId] == null) {
      unreadCount[participantId] = 0;
    }
  });

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        _id: conversationId,
        id: conversationId,
        participants,
        participantRoles,
        participantNames,
        lastMessage: content.substring(0, Math.min(content.length, 100)),
        lastMessageTime: new Date(),
        unreadCount,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  const messageId = new mongoose.Types.ObjectId().toString();
  await Message.create({
    _id: messageId,
    senderId,
    receiverId,
    senderName: actualSenderName,
    receiverName: actualReceiverName,
    content,
    type,
    conversationId,
    participants,
    senderRole,
    receiverRole,
    timestamp: new Date(),
    createdAt: new Date().toISOString(),
    isRead: false,
    read: false,
    seenByAdmin: senderRole === 'admin',
    metadata: {
      senderName,
      receiverName,
    },
  });

  return {
    messageId,
    conversationId,
    actualSenderId,
    actualReceiverId,
    actualSenderName,
    actualReceiverName,
    participants,
    rawSenderId: senderId,
    rawReceiverId: receiverId,
  };
}

async function sendMessageFirebase(firestore, admin, payload) {
  const {
    senderId,
    receiverId,
    content,
    senderName,
    receiverName,
    senderRole,
    receiverRole,
    type = 'text',
  } = payload;

  if (!firestore || !admin) throw new Error('Firestore not configured');

  const sender = await resolvePartyFirebase(firestore, senderId, senderName);
  const receiver = await resolvePartyFirebase(firestore, receiverId, receiverName);

  const actualSenderId = sender.actualId;
  const actualReceiverId = receiver.actualId;
  const actualSenderName = sender.actualName;
  const actualReceiverName = receiver.actualName;

  const participants = [actualSenderId, actualReceiverId].sort();
  const conversationId = participants.join('_');
  const roleById = { [actualSenderId]: senderRole, [actualReceiverId]: receiverRole };
  const nameById = { [actualSenderId]: actualSenderName, [actualReceiverId]: actualReceiverName };
  const participantRoles = participants.map((id) => roleById[id] || 'user');
  const participantNames = participants.map((id) => nameById[id] || id);

  const conversationRef = firestore.collection('conversations').doc(conversationId);
  const conversationDoc = await conversationRef.get();

  if (conversationDoc.exists) {
    const data = conversationDoc.data();
    const unreadCount = data.unreadCount || {};
    participants.forEach((participantId) => {
      if (participantId !== actualSenderId) {
        unreadCount[participantId] = (unreadCount[participantId] || 0) + 1;
      }
    });
    await conversationRef.update({
      lastMessage: content.substring(0, Math.min(content.length, 100)),
      lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      unreadCount,
      participantNames,
      participantRoles,
    });
  } else {
    await conversationRef.set({
      id: conversationId,
      participants,
      participantRoles,
      participantNames,
      lastMessage: content.substring(0, Math.min(content.length, 100)),
      lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      unreadCount: {
        [actualSenderId]: 0,
        [actualReceiverId]: 1,
      },
    });
  }

  const messageRef = await firestore.collection('messages').add({
    senderId: actualSenderId,
    receiverId: actualReceiverId,
    senderName: actualSenderName,
    receiverName: actualReceiverName,
    content,
    type,
    conversationId,
    participants,
    senderRole,
    receiverRole,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: new Date().toISOString(),
    isRead: false,
    seenByAdmin: senderRole === 'admin',
    metadata: { senderName, receiverName },
  });

  return {
    messageId: messageRef.id,
    conversationId,
    actualSenderId,
    actualReceiverId,
    actualSenderName,
    actualReceiverName,
    participants,
  };
}

async function sendMessage({ firestore, admin, dataBackend, payload }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return sendMessageMongo(payload);
  }
  return sendMessageFirebase(firestore, admin, payload);
}

async function markReadMongo({ conversationId, userId }) {
  await ensureMongoConnected();
  const result = await Message.updateMany(
    {
      conversationId,
      receiverId: userId,
      $or: [{ isRead: false }, { read: false }, { isRead: { $exists: false }, read: { $exists: false } }],
    },
    {
      $set: {
        isRead: true,
        read: true,
      },
    },
  );

  const conversation = await Conversation.findById(conversationId).lean();
  if (conversation) {
    const unreadCount = { ...(conversation.unreadCount || {}) };
    unreadCount[userId] = 0;
    await Conversation.updateOne({ _id: conversationId }, { $set: { unreadCount } });
  }

  return Number(result.modifiedCount || 0);
}

async function markReadFirebase(firestore, admin, { conversationId, userId }) {
  if (!firestore || !admin) throw new Error('Firestore not configured');
  const unreadMessages = await firestore.collection('messages')
    .where('conversationId', '==', conversationId)
    .where('receiverId', '==', userId)
    .where('isRead', '==', false)
    .get();

  const batch = firestore.batch();
  unreadMessages.docs.forEach((doc) => batch.update(doc.ref, { isRead: true }));
  await batch.commit();

  const conversationRef = firestore.collection('conversations').doc(conversationId);
  const conversationDoc = await conversationRef.get();
  if (conversationDoc.exists) {
    const data = conversationDoc.data();
    const unreadCount = data.unreadCount || {};
    unreadCount[userId] = 0;
    await conversationRef.update({ unreadCount });
  }

  return unreadMessages.size;
}

async function markRead({ firestore, admin, dataBackend, conversationId, userId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return markReadMongo({ conversationId, userId });
  }
  return markReadFirebase(firestore, admin, { conversationId, userId });
}

async function getUidByUserIdMongo(userId) {
  await ensureMongoConnected();
  const doc = await User.findById(userId).lean();
  return doc?.uid || null;
}

async function getUidByUserIdFirebase(firestore, userId) {
  if (!firestore) return null;
  const doc = await firestore.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return doc.data()?.uid || null;
}

async function getUidByUserId({ firestore, dataBackend, userId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getUidByUserIdMongo(userId);
  }
  return getUidByUserIdFirebase(firestore, userId);
}

module.exports = {
  sendMessage,
  markRead,
  getUidByUserId,
};
