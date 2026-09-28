import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import type { Model } from 'mongoose';

const CONTACT_PHONE_KEYS = [
  'mobile',
  'phone',
  'phoneNumber',
  'contactNumber',
  'whatsapp',
  'primaryMobile',
  'secondaryMobile',
];

function normalizeEmail(email: unknown): string | null {
  if (!email) return null;
  return String(email).trim().toLowerCase() || null;
}

function collectContactPhones(...sources: Array<Record<string, unknown> | null | undefined>): string[] {
  return sources.flatMap((source) => {
    if (!source || typeof source !== 'object') return [];
    const raw = (source['raw'] && typeof source['raw'] === 'object' ? source['raw'] : {}) as Record<string, unknown>;
    return CONTACT_PHONE_KEYS.flatMap((key) => [source[key], raw[key]]);
  }).filter((v) => String(v ?? '').trim()) as string[];
}

function hasContactFields(updateOps: Record<string, unknown>): boolean {
  return Object.keys(updateOps).some(
    (key) =>
      key === 'email' ||
      key === 'raw.email' ||
      CONTACT_PHONE_KEYS.includes(key) ||
      CONTACT_PHONE_KEYS.some((pk) => key === `raw.${pk}`),
  );
}

function buildEffectiveContactDocument(
  existing: Record<string, unknown>,
  updateOps: Record<string, unknown>,
): Record<string, unknown> {
  const rawPatch = Object.fromEntries(
    Object.entries(updateOps).filter(([k]) => k.startsWith('raw.')).map(([k, v]) => [k.slice(4), v]),
  );
  const topPatch = Object.fromEntries(Object.entries(updateOps).filter(([k]) => !k.startsWith('raw.')));
  return {
    ...existing,
    ...topPatch,
    raw: {
      ...(existing['raw'] && typeof existing['raw'] === 'object' ? (existing['raw'] as Record<string, unknown>) : {}),
      ...rawPatch,
    },
  };
}

@Injectable()
export class FamilyMembersService {
  constructor(
    @InjectModel('FamilyMember')
    private readonly familyMemberModel: Model<Record<string, unknown>>,
    @InjectModel('Family')
    private readonly familyModel: Model<Record<string, unknown>>,
    @InjectModel('User')
    private readonly userModel: Model<Record<string, unknown>>,
    @InjectModel('Student')
    private readonly studentModel: Model<Record<string, unknown>>,
  ) {}

  private emailRegex(email: string): Record<string, unknown> {
    return { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  private async assertUniqueContactForMember(
    contact: { label: string; email?: string | null; phones?: string[] },
    excludeOwners: Array<{ collection: string; id?: string; userId?: string }> = [],
  ): Promise<void> {
    const normalizedMail = normalizeEmail(contact.email);
    if (normalizedMail) {
      const emailRx = this.emailRegex(normalizedMail);
      const memberConflict = await this.familyMemberModel.findOne({
        $or: [
          { email: normalizedMail },
          { email: emailRx },
          { 'raw.email': normalizedMail },
          { 'raw.email': emailRx },
        ],
      }).lean() as Record<string, unknown> | null;
      if (memberConflict) {
        const mid = String(memberConflict['_id']);
        const excluded = excludeOwners.some((ex) => ex.collection === 'familyMembers' && ex.id === mid);
        if (!excluded) throw new ConflictException(`Email already in use by another member (${contact.label})`);
      }
    }

    const phones = (contact.phones ?? []).filter((p) => String(p ?? '').trim());
    for (const phone of phones) {
      const phoneStr = String(phone).trim();
      const phoneRx = this.emailRegex(phoneStr);
      const conflict = await this.familyMemberModel.findOne({
        $or: CONTACT_PHONE_KEYS.flatMap((k) => [
          { [k]: phoneStr },
          { [k]: phoneRx },
          { [`raw.${k}`]: phoneStr },
          { [`raw.${k}`]: phoneRx },
        ]),
      }).lean() as Record<string, unknown> | null;
      if (conflict) {
        const mid = String(conflict['_id']);
        const excluded = excludeOwners.some((ex) => ex.collection === 'familyMembers' && ex.id === mid);
        if (!excluded) throw new ConflictException(`Phone already in use (${contact.label})`);
      }
    }
  }

  // GET /api/admin/families/:id/members
  async getFamilyMembers(
    familyId: string,
    familyScope: string[] | null,
    familyScopeActive: boolean,
  ): Promise<{ success: true; members: Record<string, unknown>[] }> {
    if (familyScopeActive && Array.isArray(familyScope) && !familyScope.includes(familyId)) {
      throw new NotFoundException('Family not found');
    }
    const members = await this.familyMemberModel.find({ familyId }).lean() as Record<string, unknown>[];
    return { success: true, members: members.map((m) => ({ id: m['_id'], ...m })) };
  }

  // POST /api/admin/families/:id/members
  async createFamilyMember(
    familyId: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; member: Record<string, unknown> }> {
    const {
      _id: existingId, role, status, uid, studentId, name, email, assignedTeacher, isActive, ...rest
    } = body;

    const memberId = (existingId as string) || crypto.randomBytes(16).toString('hex');

    const family = await this.familyModel.findById(familyId).lean() as Record<string, unknown> | null;
    if (!family) throw new NotFoundException('Family not found');

    await this.assertUniqueContactForMember({
      label: `family member ${(name as string) || memberId}`,
      email: email as string | undefined,
      phones: collectContactPhones(rest),
    });

    let memberUid = uid as string | null | undefined;

    // If role is student and no uid provided, create User + Student accounts
    if ((role === 'student' || !role) && !uid) {
      const userId = crypto.randomBytes(16).toString('hex');

      await this.userModel.findOneAndUpdate(
        { _id: userId },
        {
          $set: {
            _id: userId,
            name: name || '',
            email: email || '',
            role: 'student',
            parentId: family['parentUid'] || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );

      await this.studentModel.findOneAndUpdate(
        { _id: userId },
        {
          $set: {
            _id: userId,
            name: name || '',
            email: email || '',
            parentId: family['parentUid'] || null,
            studentStatus: status || 'active',
            assignedTeacher: assignedTeacher || null,
            teacherId: assignedTeacher || null,
            isActive: isActive !== false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );

      memberUid = userId;
    }

    const member = await this.familyMemberModel.findOneAndUpdate(
      { _id: memberId },
      {
        $set: {
          _id: memberId,
          familyId,
          name: name || '',
          email: email || '',
          assignedTeacher: assignedTeacher || '',
          role: role || 'student',
          status: status || 'active',
          isActive: isActive !== false,
          uid: memberUid || null,
          studentId: studentId || null,
          raw: { name, email, assignedTeacher, ...rest },
        },
      },
      { upsert: true, new: true },
    ).lean() as Record<string, unknown>;

    return { success: true, member: { id: member['_id'], ...member } };
  }

  // PUT /api/admin/families/:id/members/:memberId
  async updateFamilyMember(
    _familyId: string,
    memberId: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; member: Record<string, unknown> }> {
    const { raw: rawUpdate, ...topLevel } = body;

    const updateOps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(topLevel)) {
      if (k !== '_id') updateOps[k] = v;
    }
    if (rawUpdate && typeof rawUpdate === 'object') {
      for (const [k, v] of Object.entries(rawUpdate as Record<string, unknown>)) {
        updateOps[`raw.${k}`] = v;
      }
    }

    const existingMember = await this.familyMemberModel.findById(memberId).lean() as Record<string, unknown> | null;
    if (!existingMember) throw new NotFoundException('Family member not found');

    if (Object.prototype.hasOwnProperty.call(updateOps, 'email')) {
      updateOps['email'] = normalizeEmail(updateOps['email']);
    }

    if (hasContactFields(updateOps)) {
      const effective = buildEffectiveContactDocument(existingMember, updateOps);
      const effectiveRaw = (effective['raw'] as Record<string, unknown>) ?? {};
      await this.assertUniqueContactForMember(
        {
          label: `family member ${(existingMember['name'] as string) || memberId}`,
          email: (effective['email'] as string) || (effectiveRaw['email'] as string) || '',
          phones: collectContactPhones(effective),
        },
        [
          {
            collection: 'familyMembers',
            id: memberId,
            userId: String(existingMember['uid'] || existingMember['studentId'] || ''),
          },
          { collection: 'users', id: String(existingMember['uid'] || '') },
          { collection: 'students', id: String(existingMember['uid'] || existingMember['studentId'] || '') },
        ],
      );
    }

    const updated = await this.familyMemberModel
      .findByIdAndUpdate(memberId, { $set: updateOps }, { new: true })
      .lean() as Record<string, unknown>;

    return { success: true, member: { id: updated['_id'], ...updated } };
  }

  // DELETE /api/admin/families/:id/members/:memberId
  async deleteFamilyMember(
    _familyId: string,
    memberId: string,
  ): Promise<{ success: true; message: string }> {
    await this.familyMemberModel.findByIdAndDelete(memberId);
    return { success: true, message: 'Family member removed' };
  }
}
