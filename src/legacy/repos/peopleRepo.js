const { connectMongo } = require('../db');
const User = require('../models/User');
const Student = require('../models/Student');
const FamilyMember = require('../models/FamilyMember');
const Employee = require('../models/Employee');

let mongoConnected = false;

async function ensureMongoConnected() {
  if (mongoConnected) return;
  await connectMongo();
  mongoConnected = true;
}

function normalizeDoc(doc) {
  return {
    id: doc._id,
    ...doc,
  };
}

async function getAdminsMongo() {
  await ensureMongoConnected();
  const docs = await User.find({ role: 'admin' }).lean();
  return docs.map(normalizeDoc);
}

async function getTeachersMongo() {
  await ensureMongoConnected();
  const docs = await User.find({ role: 'teacher', isActive: { $ne: false } }).lean();
  return docs.map(normalizeDoc);
}

async function getTeacherByIdMongo(teacherId) {
  await ensureMongoConnected();
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return null;
  const escapedTeacher = normalizedTeacherId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const doc = await User.findOne({
    role: 'teacher',
    $or: [
      { _id: normalizedTeacherId },
      { uid: normalizedTeacherId },
      { email: { $regex: `^${escapedTeacher}$`, $options: 'i' } },
    ],
  }).lean();
  if (!doc) return null;
  return normalizeDoc(doc);
}

async function getAdminsFirebase(firestore) {
  if (!firestore) return null;
  const snapshot = await firestore.collection('users').where('role', '==', 'admin').get();
  const admins = [];
  snapshot.forEach((doc) => admins.push({ id: doc.id, ...doc.data() }));
  return admins;
}

async function getTeachersFirebase(firestore) {
  if (!firestore) return null;
  const snapshot = await firestore.collection('users').where('role', '==', 'teacher').get();
  const teachers = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.isActive === false) return;
    teachers.push({ id: doc.id, ...data });
  });
  return teachers;
}

async function getTeacherByIdFirebase(firestore, teacherId) {
  if (!firestore) return null;
  const snap = await firestore.collection('users').doc(teacherId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getAdmins({ firestore, dataBackend }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getAdminsMongo();
  }
  return getAdminsFirebase(firestore);
}

async function getTeachers({ firestore, dataBackend }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getTeachersMongo();
  }
  return getTeachersFirebase(firestore);
}

async function getTeacherById({ firestore, dataBackend, teacherId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getTeacherByIdMongo(teacherId);
  }
  return getTeacherByIdFirebase(firestore, teacherId);
}

async function getTeacherStudentsMongo(teacherId) {
  await ensureMongoConnected();
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return [];

  const teacherIdentifiers = new Set([normalizedTeacherId]);
  const escapedTeacher = normalizedTeacherId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Resolve aliases so assignment lookup works even if some records store
  // teacher uid, employee id, or email across legacy/new data shapes.
  const employeeDoc = await Employee.findOne({
    $or: [
      { _id: normalizedTeacherId },
      { uid: normalizedTeacherId },
      { email: { $regex: `^${escapedTeacher}$`, $options: 'i' } },
    ],
  }).lean();
  if (employeeDoc) {
    teacherIdentifiers.add(String(employeeDoc._id || ''));
    teacherIdentifiers.add(String(employeeDoc.uid || ''));
    teacherIdentifiers.add(String(employeeDoc.email || '').toLowerCase());
  }

  const userTeacherDoc = await User.findOne({
    role: 'teacher',
    $or: [
      { _id: normalizedTeacherId },
      { uid: normalizedTeacherId },
      { email: { $regex: `^${escapedTeacher}$`, $options: 'i' } },
    ],
  }).lean();
  if (userTeacherDoc) {
    teacherIdentifiers.add(String(userTeacherDoc._id || ''));
    teacherIdentifiers.add(String(userTeacherDoc.uid || ''));
    teacherIdentifiers.add(String(userTeacherDoc.email || '').toLowerCase());
  }

  const teacherIdCandidates = Array.from(teacherIdentifiers).filter(Boolean);

  const directStudentDocs = await User.find({
    role: 'student',
    assignedTeacher: { $in: teacherIdCandidates },
    isActive: { $ne: false },
  }).lean();

  const byId = new Map();
  directStudentDocs.forEach((doc) => {
    byId.set(doc._id, {
      id: doc._id,
      uid: doc._id,
      ...doc,
    });
  });

  // Legacy/new shape: students collection with teacherId/assignedTeacher.
  const studentCollectionDocs = await Student.find({
    $or: [
      { teacherId: { $in: teacherIdCandidates } },
      { assignedTeacher: { $in: teacherIdCandidates } },
    ],
  }).lean();
  studentCollectionDocs.forEach((doc) => {
    const studentId = String(doc._id || '').trim();
    if (!studentId || byId.has(studentId)) return;
    byId.set(studentId, {
      id: studentId,
      uid: studentId,
      studentId,
      memberId: null,
      familyMemberId: null,
      name: doc.name || studentId,
      email: doc.email || null,
      assignedTeacher: doc.assignedTeacher || doc.teacherId || teacherId,
      teacherId: doc.teacherId || doc.assignedTeacher || normalizedTeacherId,
      studentStatus: doc.studentStatus || null,
      isOnline: doc.isOnline === true,
      parentId: doc.parentId || null,
      createdAt: doc.createdAt || doc.raw?.createdAt || null,
      updatedAt: doc.updatedAt || doc.raw?.updatedAt || null,
      assignedAt: doc.raw?.assignedAt || doc.assignedAt || null,
      source: 'students_collection',
    });
  });

  // Also support parent->children structure used by current platform.
  const parentDocs = await User.find({
    role: 'parent',
    'children.assignedTeacher': { $in: teacherIdCandidates },
  }).lean();

  parentDocs.forEach((parent) => {
    const children = Array.isArray(parent.children) ? parent.children : [];
    children.forEach((child) => {
      if (!child || !teacherIdentifiers.has(String(child.assignedTeacher || '').trim())) return;
      const studentId = String(child.studentId || '').trim();
      if (!studentId) return;
      if (byId.has(studentId)) return;
      byId.set(studentId, {
        id: studentId,
        uid: studentId,
        studentId,
        memberId: String(child.memberId || child.familyMemberId || '').trim() || null,
        familyMemberId: String(child.familyMemberId || child.memberId || '').trim() || null,
        name: child.name || studentId,
        email: child.email || null,
        assignedTeacher: child.assignedTeacher || normalizedTeacherId,
        studentStatus: child.studentStatus || null,
        isOnline: child.isOnline === true,
        avatarColor: child.avatarColor || null,
        avatarUrl: child.avatarUrl || null,
        parentId: parent._id,
        createdAt: child.createdAt || null,
        updatedAt: child.updatedAt || null,
        assignedAt: child.assignedAt || null,
        source: 'parent_children',
      });
    });
  });

  // IMPORTANT: Query FamilyMember collection for students assigned via LMS
  console.log(`🔍 Querying FamilyMember collection for teacher: ${normalizedTeacherId}`);
  const familyMemberDocs = await FamilyMember.find({
    role: 'student',
    assignedTeacher: { $in: teacherIdCandidates },
  }).lean();

  console.log(`📋 Found ${familyMemberDocs.length} family members with assignedTeacher in [${teacherIdCandidates.join(', ')}]`);

  // Also check if there are ANY family members with role=student
  const allStudentMembers = await FamilyMember.find({ role: 'student' }).lean();
  console.log(`📊 Total student family members in DB: ${allStudentMembers.length}`);
  if (allStudentMembers.length > 0) {
    const sample = allStudentMembers[0];
    console.log(`📄 Sample family member:`, {
      id: sample._id,
      role: sample.role,
      assignedTeacher: sample.assignedTeacher,
      name: sample.raw?.name || sample.name,
    });
  }

  for (const member of familyMemberDocs) {
    const studentId = String(member.uid || member._id || member.studentId || '').trim();
    console.log(`✅ Processing family member: ${studentId}, name: ${member.raw?.name || member.name}`);
    if (!studentId || byId.has(studentId)) continue;

    // Get parent/family info for messaging context
    const familyId = member.familyId;
    let parentId = null;
    let parentEmail = '';

    if (familyId) {
      const Family = require('../models/Family');
      const familyDoc = await Family.findById(familyId).lean();
      if (familyDoc) {
        parentId = familyDoc.parentUid || familyDoc._id;
        parentEmail = familyDoc.email || '';
      }
    }

    // IMPORTANT: Get isOnline status from students collection, not family_members
    const studentDoc = await Student.findById(studentId).lean();
    const isOnline = studentDoc?.isOnline === true;

    byId.set(studentId, {
      id: studentId,
      uid: studentId,
      studentId,
      memberId: String(member._id || '').trim() || null,
      familyMemberId: String(member._id || '').trim() || null,
      name: member.raw?.name || member.name || studentId,
      email: parentEmail,
      assignedTeacher: member.assignedTeacher || normalizedTeacherId,
      assignedTeacherName: member.assignedTeacherName || null,
      studentStatus: member.status || null,
      isOnline: isOnline,  // From students collection
      avatarColor: member.raw?.avatarColor || null,
      avatarUrl: member.raw?.avatarUrl || null,
      parentId: parentId || familyId,
      familyId,
      createdAt: member.createdAt || studentDoc?.createdAt || member.raw?.createdAt || null,
      updatedAt: member.updatedAt || studentDoc?.updatedAt || member.raw?.updatedAt || null,
      assignedAt: member.raw?.assignedAt || member.assignedAt || null,
      source: 'family_members',
    });
  }

  return Array.from(byId.values());
}

async function getTeacherStudentsFirebase(firestore, teacherId) {
  if (!firestore) throw new Error('Firestore not configured');
  const snapshot = await firestore
    .collection('users')
    .where('role', '==', 'student')
    .where('assignedTeacher', '==', teacherId)
    .get();
  const students = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.isActive === false) return;
    students.push({
      id: doc.id,
      uid: doc.id,
      ...data,
    });
  });
  return students;
}

async function getTeacherStudents({ firestore, dataBackend, teacherId }) {
  const backend = (dataBackend || 'firebase').toLowerCase();
  if (backend === 'mongo') {
    return getTeacherStudentsMongo(teacherId);
  }
  return getTeacherStudentsFirebase(firestore, teacherId);
}

module.exports = {
  getAdmins,
  getTeachers,
  getTeacherById,
  getTeacherStudents,
};
