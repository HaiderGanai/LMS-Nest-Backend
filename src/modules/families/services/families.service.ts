import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Model } from 'mongoose';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTACT_PHONE_KEYS = [
  'mobile',
  'phone',
  'phoneNumber',
  'contactNumber',
  'whatsapp',
  'primaryMobile',
  'secondaryMobile',
];

function normalizeEmail(email: string | null | undefined): string | null {
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
      key === 'parentEmail' ||
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
    Object.entries(updateOps)
      .filter(([k]) => k.startsWith('raw.'))
      .map(([k, v]) => [k.slice(4), v]),
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

function generateTempPassword(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

// ---------------------------------------------------------------------------
// assertUniqueContacts — inline port of Express helper
// ---------------------------------------------------------------------------

interface ContactEntry {
  label: string;
  email?: string | null;
  phones?: string[];
}

interface ExcludeOwner {
  collection: string;
  id?: string;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class FamiliesService {
  constructor(
    @InjectModel('Family')
    private readonly familyModel: Model<Record<string, unknown>>,
    @InjectModel('FamilyMember')
    private readonly familyMemberModel: Model<Record<string, unknown>>,
    @InjectModel('User')
    private readonly userModel: Model<Record<string, unknown>>,
    @InjectModel('LocalAuthCredential')
    private readonly localAuthCredentialModel: Model<Record<string, unknown>>,
  ) {}

  // -------------------------------------------------------------------------
  // Internal contact uniqueness assertion
  // -------------------------------------------------------------------------

  private emailRegex(email: string): Record<string, unknown> {
    return { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  private async assertUniqueContacts(
    contacts: ContactEntry[],
    opts: { excludeOwners?: ExcludeOwner[] } = {},
  ): Promise<void> {
    const excludeOwners = opts.excludeOwners ?? [];

    for (const contact of contacts) {
      const normalizedMail = normalizeEmail(contact.email);

      if (normalizedMail) {
        const emailRx = this.emailRegex(normalizedMail);

        // Check family collection
        const familyEmailConflict = await this.familyModel.findOne({
          $or: [
            { parentEmail: normalizedMail },
            { email: normalizedMail },
            { 'raw.email': normalizedMail },
            { parentEmail: emailRx },
            { email: emailRx },
            { 'raw.email': emailRx },
          ],
        }).lean();

        if (familyEmailConflict) {
          const familyId = String((familyEmailConflict as Record<string, unknown>)['_id']);
          const isExcluded = excludeOwners.some(
            (ex) => ex.collection === 'families' && ex.id === familyId,
          );
          if (!isExcluded) {
            throw new ConflictException(`Email already in use by another family (${contact.label})`);
          }
        }

        // Check credential collection
        const credConflict = await this.localAuthCredentialModel.findById(normalizedMail).lean();
        if (credConflict) {
          const userId = String((credConflict as Record<string, unknown>)['userId'] ?? '');
          const isExcluded = excludeOwners.some(
            (ex) =>
              (ex.collection === 'localAuthCredentials' && ex.id === normalizedMail) ||
              (ex.collection === 'users' && ex.id === userId),
          );
          if (!isExcluded) {
            throw new ConflictException(`Email already registered as a credential (${contact.label})`);
          }
        }

        // Check user collection
        const userConflict = await this.userModel.findOne({ email: emailRx }).lean();
        if (userConflict) {
          const userId = String((userConflict as Record<string, unknown>)['_id']);
          const isExcluded = excludeOwners.some(
            (ex) => ex.collection === 'users' && ex.id === userId,
          );
          if (!isExcluded) {
            throw new ConflictException(`Email already in use by a user account (${contact.label})`);
          }
        }
      }

      // Phone uniqueness — check across families
      const phones = (contact.phones ?? []).filter((p) => String(p ?? '').trim());
      for (const phone of phones) {
        const phoneStr = String(phone).trim();
        if (!phoneStr) continue;
        const phoneRx = this.emailRegex(phoneStr);

        const familyPhoneConflict = await this.familyModel.findOne({
          $or: CONTACT_PHONE_KEYS.flatMap((k) => [
            { [k]: phoneStr },
            { [k]: phoneRx },
            { [`raw.${k}`]: phoneStr },
            { [`raw.${k}`]: phoneRx },
          ]),
        }).lean();

        if (familyPhoneConflict) {
          const familyId = String((familyPhoneConflict as Record<string, unknown>)['_id']);
          const isExcluded = excludeOwners.some(
            (ex) => ex.collection === 'families' && ex.id === familyId,
          );
          if (!isExcluded) {
            throw new ConflictException(`Phone number already in use (${contact.label})`);
          }
        }
      }
    }
  }

  private async findFamilyAccountCollisionByEmail(
    normalizedMail: string,
  ): Promise<Record<string, unknown> | null> {
    const emailRx = this.emailRegex(normalizedMail);

    const existingFamily = await this.familyModel.findOne({
      $or: [
        { parentEmail: normalizedMail },
        { email: normalizedMail },
        { 'raw.email': normalizedMail },
        { parentEmail: emailRx },
        { email: emailRx },
        { 'raw.email': emailRx },
      ],
    }).lean();

    if (existingFamily) {
      return {
        source: 'family',
        familyId: (existingFamily as Record<string, unknown>)['_id'],
        parentUid: (existingFamily as Record<string, unknown>)['parentUid'] ?? null,
        parentEmail:
          (existingFamily as Record<string, unknown>)['parentEmail'] ||
          (existingFamily as Record<string, unknown>)['email'] ||
          ((existingFamily as Record<string, unknown>)['raw'] as Record<string, unknown> | undefined)?.['email'] ||
          null,
      };
    }

    const existingCred = await this.localAuthCredentialModel.findById(normalizedMail).lean();
    if ((existingCred as Record<string, unknown> | null)?.['userId']) {
      return {
        source: 'credential',
        familyId: null,
        parentUid: String((existingCred as Record<string, unknown>)['userId']),
        parentEmail: normalizedMail,
      };
    }

    const existingUser = await this.userModel.findOne({ email: emailRx }).lean();
    if (existingUser) {
      return {
        source: 'user',
        familyId: null,
        parentUid: String((existingUser as Record<string, unknown>)['_id']),
        parentEmail:
          (existingUser as Record<string, unknown>)['email'] || normalizedMail,
      };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Flatten helper — mirrors Express response shape
  // -------------------------------------------------------------------------

  private flattenFamily(f: Record<string, unknown>): Record<string, unknown> {
    const raw = (f['raw'] && typeof f['raw'] === 'object' ? f['raw'] : {}) as Record<string, unknown>;
    return {
      id: f['_id'],
      ...f,
      parentName: f['parentName'] || raw['parentName'] || f['name'] || '',
      email: f['email'] || f['parentEmail'] || raw['email'] || '',
      uniqueId: f['uniqueId'] || raw['uniqueId'] || null,
      registrationCode: f['registrationCode'] || raw['registrationCode'] || null,
      primaryMobile: f['primaryMobile'] || raw['primaryMobile'] || '',
      secondaryMobile: f['secondaryMobile'] || raw['secondaryMobile'] || '',
      country: f['country'] || raw['country'] || '',
      city: f['city'] || raw['city'] || '',
      timezone: f['timezone'] || raw['timezone'] || '',
      assignedManager: f['assignedManager'] || raw['assignedManager'] || '',
      source: f['source'] || raw['source'] || '',
      feeType: f['feeType'] || raw['feeType'] || 'hourly',
      feeRate: f['feeRate'] ?? raw['feeRate'] ?? '',
      includedHours: f['includedHours'] ?? raw['includedHours'] ?? 0,
      currency: f['currency'] || raw['currency'] || 'USD',
      paymentModes: Array.isArray(f['paymentModes'])
        ? f['paymentModes']
        : Array.isArray(raw['paymentModes'])
          ? raw['paymentModes']
          : [],
      invoiceCycleType: f['invoiceCycleType'] || raw['invoiceCycleType'] || '',
      invoiceCycleDate: f['invoiceCycleDate'] || raw['invoiceCycleDate'] || '',
    };
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/families
  // -------------------------------------------------------------------------

  async getFamilies(
    familyScope: string[] | null,
    familyScopeActive: boolean,
  ): Promise<{ success: true; families: Record<string, unknown>[] }> {
    const baseFilter: Record<string, unknown> = {};
    const filter =
      familyScopeActive && Array.isArray(familyScope)
        ? { ...baseFilter, _id: { $in: familyScope } }
        : baseFilter;

    const families = await this.familyModel.find(filter).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
    const familyIds = families.map((f) => f['_id']);
    const allMembers = await this.familyMemberModel.find({ familyId: { $in: familyIds } }).lean() as Record<string, unknown>[];

    const membersByFamily: Record<string, Record<string, unknown>[]> = {};
    for (const m of allMembers) {
      const fid = String(m['familyId']);
      if (!membersByFamily[fid]) membersByFamily[fid] = [];
      let isOnline: boolean | null = null;
      if (m['role'] === 'student') {
        // Socket presence not available in NestJS context — default false
        isOnline = false;
      }
      membersByFamily[fid].push({ id: m['_id'], ...m, isOnline });
    }

    const result = families.map((f) => {
      const members = membersByFamily[String(f['_id'])] ?? [];
      const familyOnline = members.some((m) => m['role'] === 'student' && m['isOnline']);
      return {
        ...this.flattenFamily(f),
        isOnline: familyOnline,
        members,
        memberCount: members.length,
      };
    });

    return { success: true, families: result };
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/families/stats
  // -------------------------------------------------------------------------

  async getFamilyStats(): Promise<{ success: true; stats: Record<string, unknown> }> {
    const families = await this.familyModel.find({}).lean() as Record<string, unknown>[];
    const stats: { total: number; byStatus: Record<string, number> } = {
      total: families.length,
      byStatus: {},
    };
    for (const f of families) {
      const s = String(f['status'] ?? 'unknown');
      stats.byStatus[s] = (stats.byStatus[s] ?? 0) + 1;
    }
    return { success: true, stats };
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/families/:id
  // -------------------------------------------------------------------------

  async getFamilyById(
    id: string,
    familyScope: string[] | null,
    familyScopeActive: boolean,
  ): Promise<{ success: true; family: Record<string, unknown> }> {
    if (familyScopeActive && Array.isArray(familyScope) && !familyScope.includes(id)) {
      throw new NotFoundException('Family not found');
    }

    const family = await this.familyModel.findById(id).lean() as Record<string, unknown> | null;
    if (!family) throw new NotFoundException('Family not found');

    const members = await this.familyMemberModel.find({ familyId: id }).lean() as Record<string, unknown>[];

    const presenceIds = [
      family['parentUid'],
      ...members.filter((m) => m['role'] === 'student' && m['uid']).map((m) => m['uid']),
    ].filter(Boolean) as string[];

    const presenceMap: Record<string, boolean> = {};
    if (presenceIds.length > 0) {
      const presenceUsers = await this.userModel
        .find({ _id: { $in: presenceIds } })
        .select({ _id: 1, isOnline: 1 })
        .lean() as Record<string, unknown>[];
      for (const u of presenceUsers) {
        presenceMap[String(u['_id'])] = !!(u['isOnline']);
      }
    }

    const flatFamily = this.flattenFamily(family);
    const parentUid = family['parentUid'] ? String(family['parentUid']) : null;

    return {
      success: true,
      family: {
        ...flatFamily,
        parentOnline: parentUid ? (presenceMap[parentUid] ?? null) : null,
        members: members.map((m) => ({
          id: m['_id'],
          ...m,
          isOnline: m['uid'] ? (presenceMap[String(m['uid'])] ?? null) : null,
        })),
      },
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/admin/families
  // -------------------------------------------------------------------------

  async createFamily(body: Record<string, unknown>): Promise<{
    success: true;
    family: Record<string, unknown>;
    tempPassword: string | null;
  }> {
    const {
      email,
      parentName,
      status,
      members: memberData,
      password,
      uniqueId,
      registrationCode,
      ...rest
    } = body;

    if (!parentName) throw new BadRequestException('parentName is required');

    const normalizedMail = normalizeEmail(email as string | null | undefined);
    const familyStatus = (status as string) || 'trial';

    // Contact uniqueness check
    const memberEntries = Array.isArray(memberData)
      ? (memberData as Record<string, unknown>[]).map((m, i) => ({
          label: `family member ${(m['name'] as string) || String(i + 1)}`,
          email: m['email'] as string | undefined,
          phones: collectContactPhones(m),
        }))
      : [];

    await this.assertUniqueContacts([
      {
        label: `family ${String(parentName)}`,
        email: normalizedMail,
        phones: collectContactPhones(rest as Record<string, unknown>),
      },
      ...memberEntries,
    ]);

    if (normalizedMail) {
      const collision = await this.findFamilyAccountCollisionByEmail(normalizedMail);
      if (collision) {
        throw Object.assign(new ConflictException('Account already exists for this email'), { collision });
      }
    }

    const familyId = crypto.randomBytes(16).toString('hex');
    const parentUid = crypto.randomBytes(16).toString('hex');

    const family = await this.familyModel.create({
      _id: familyId,
      parentUid,
      parentEmail: normalizedMail,
      status: familyStatus,
      name: parentName,
      parentName: (parentName as string) || '',
      email: normalizedMail,
      uniqueId: uniqueId || null,
      registrationCode: registrationCode || null,
      primaryMobile: (rest as Record<string, unknown>)['primaryMobile'] || '',
      secondaryMobile: (rest as Record<string, unknown>)['secondaryMobile'] || '',
      country: (rest as Record<string, unknown>)['country'] || '',
      city: (rest as Record<string, unknown>)['city'] || '',
      timezone: (rest as Record<string, unknown>)['timezone'] || '',
      assignedManager: (rest as Record<string, unknown>)['assignedManager'] || '',
      source: (rest as Record<string, unknown>)['source'] || '',
      feeType: (rest as Record<string, unknown>)['feeType'] || 'hourly',
      feeRate: (rest as Record<string, unknown>)['feeRate'] ?? '',
      includedHours: (rest as Record<string, unknown>)['includedHours'] ?? 0,
      currency: (rest as Record<string, unknown>)['currency'] || 'USD',
      paymentModes: Array.isArray((rest as Record<string, unknown>)['paymentModes'])
        ? (rest as Record<string, unknown>)['paymentModes']
        : [],
      invoiceCycleType: (rest as Record<string, unknown>)['invoiceCycleType'] || '',
      invoiceCycleDate: (rest as Record<string, unknown>)['invoiceCycleDate'] || '',
      raw: { parentName, ...rest },
    });

    let tempPassword: string | null = null;

    if (normalizedMail) {
      await this.userModel.findOneAndUpdate(
        { _id: parentUid },
        {
          $setOnInsert: {
            _id: parentUid,
            email: normalizedMail,
            name: parentName,
            role: 'parent',
            isActive: true,
            isOnline: false,
            familyId,
            children: [],
            raw: {},
          },
        },
        { upsert: true, new: true },
      );

      tempPassword = ((password as string) || generateTempPassword());
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      await this.localAuthCredentialModel.findOneAndUpdate(
        { _id: normalizedMail },
        {
          $setOnInsert: {
            _id: normalizedMail,
            email: normalizedMail,
            userId: parentUid,
            role: 'parent',
            name: parentName,
            passwordHash,
            isActive: true,
            disabled: false,
          },
        },
        { upsert: true, new: true },
      );

      await this.userModel.updateOne(
        { _id: parentUid },
        {
          $set: {
            password: passwordHash,
            email: normalizedMail,
            name: parentName,
            role: 'parent',
            isActive: true,
            status: 'active',
            updatedAt: new Date(),
          },
        },
      );

      await this.familyModel.findByIdAndUpdate(familyId, {
        $set: { 'raw.tempPassword': tempPassword },
      });
    }

    // Create members
    const addedMembers: Record<string, unknown>[] = [];
    if (Array.isArray(memberData)) {
      for (const m of memberData as Record<string, unknown>[]) {
        const memberId = crypto.randomBytes(16).toString('hex');

        let resolvedStudentId: string | null = null;
        if (m['studentId']) {
          const conflict = await this.familyMemberModel.exists({
            familyId: { $ne: familyId },
            $or: [{ _id: m['studentId'] }, { studentId: m['studentId'] }],
          });
          if (!conflict) {
            resolvedStudentId = String(m['studentId']);
          }
        }

        const member = await this.familyMemberModel.create({
          _id: memberId,
          familyId,
          name: m['name'] || '',
          email: m['email'] || '',
          assignedTeacher: m['assignedTeacher'] || '',
          uid: m['uid'] || null,
          studentId: resolvedStudentId,
          role: m['role'] || 'student',
          status: m['status'] || 'active',
          isActive: m['isActive'] !== false,
          studentStatus: m['studentStatus'] || null,
          feeRate: m['feeRate'] ?? null,
          raw: m,
        });
        addedMembers.push({ id: member['_id'], ...(member as unknown as Record<string, unknown>) });
      }
    }

    return {
      success: true,
      family: { id: familyId, ...(family as unknown as Record<string, unknown>), members: addedMembers },
      tempPassword,
    };
  }

  // -------------------------------------------------------------------------
  // PUT /api/admin/families/:id
  // -------------------------------------------------------------------------

  async updateFamily(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; family: Record<string, unknown> }> {
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

    const existingFamily = await this.familyModel.findById(id).lean() as Record<string, unknown> | null;
    if (!existingFamily) throw new NotFoundException('Family not found');

    if (Object.prototype.hasOwnProperty.call(updateOps, 'email')) {
      updateOps['email'] = normalizeEmail(updateOps['email'] as string);
    }
    if (Object.prototype.hasOwnProperty.call(updateOps, 'parentEmail')) {
      updateOps['parentEmail'] = normalizeEmail(updateOps['parentEmail'] as string);
    }

    if (hasContactFields(updateOps)) {
      const effective = buildEffectiveContactDocument(existingFamily, updateOps);
      const effectiveRaw = (effective['raw'] as Record<string, unknown>) ?? {};
      await this.assertUniqueContacts(
        [
          {
            label: `family ${(existingFamily['parentName'] as string) || (existingFamily['name'] as string) || id}`,
            email:
              (effective['email'] as string) ||
              (effective['parentEmail'] as string) ||
              (effectiveRaw['email'] as string) ||
              '',
            phones: collectContactPhones(effective),
          },
        ],
        {
          excludeOwners: [
            { collection: 'families', id, userId: String(existingFamily['parentUid'] ?? '') },
            { collection: 'users', id: String(existingFamily['parentUid'] ?? '') },
            {
              collection: 'localAuthCredentials',
              id: String(existingFamily['parentEmail'] || existingFamily['email'] || ''),
              userId: String(existingFamily['parentUid'] ?? ''),
            },
          ],
        },
      );
    }

    const updated = await this.familyModel
      .findByIdAndUpdate(id, { $set: updateOps }, { new: true })
      .lean() as Record<string, unknown> | null;
    if (!updated) throw new NotFoundException('Family not found');

    return { success: true, family: { id: updated['_id'], ...updated } };
  }

  // -------------------------------------------------------------------------
  // PUT /api/admin/families/:id/status
  // -------------------------------------------------------------------------

  async updateFamilyStatus(
    id: string,
    body: { status: string; reason?: string },
    actorUid: string,
  ): Promise<{ success: true; family: Record<string, unknown> }> {
    const { status, reason } = body;
    if (!status) throw new BadRequestException('status is required');

    const family = await this.familyModel.findById(id).lean() as Record<string, unknown> | null;
    if (!family) throw new NotFoundException('Family not found');

    const statusEntry = {
      from: family['status'],
      to: status,
      changedAt: new Date().toISOString(),
      changedBy: actorUid || 'admin',
      reason: reason || '',
    };

    const updated = await this.familyModel
      .findByIdAndUpdate(
        id,
        { $set: { status }, $push: { 'raw.statusHistory': statusEntry } },
        { new: true },
      )
      .lean() as Record<string, unknown>;

    return { success: true, family: { id: updated['_id'], ...updated } };
  }

  // -------------------------------------------------------------------------
  // DELETE /api/admin/families/:id
  // -------------------------------------------------------------------------

  async deleteFamily(
    id: string,
    hardParam: string | undefined,
    actorUid: string,
  ): Promise<{ success: true; message: string }> {
    const hardDelete = String(hardParam ?? '').toLowerCase() !== 'false';

    const existing = await this.familyModel.findById(id).lean() as Record<string, unknown> | null;
    if (!existing) throw new NotFoundException('Family not found');

    if (hardDelete) {
      await this.familyModel.findByIdAndDelete(id);
      await this.familyMemberModel.deleteMany({ familyId: id });

      if (existing['parentUid']) {
        await this.userModel.findByIdAndUpdate(existing['parentUid'], {
          $set: { isActive: false, status: 'deactivated' },
        });
        await this.localAuthCredentialModel.findOneAndUpdate(
          { userId: existing['parentUid'] },
          { $set: { isActive: false, disabled: true } },
        );
      }
      if (existing['parentEmail']) {
        await this.localAuthCredentialModel.findOneAndUpdate(
          { _id: String(existing['parentEmail']).toLowerCase() },
          { $set: { isActive: false, disabled: true } },
        );
      }
    } else {
      const statusEntry = {
        from: existing['status'] || 'unknown',
        to: 'deactivated',
        changedAt: new Date().toISOString(),
        changedBy: actorUid,
        reason: 'deleted-by-admin',
      };

      await this.familyModel.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'deactivated',
            'raw.deactivatedAt': new Date().toISOString(),
            'raw.deactivatedBy': actorUid,
            'raw.deactivationReason': 'deleted-by-admin',
          },
          $push: { 'raw.statusHistory': statusEntry },
        },
        { new: true },
      );

      await this.familyMemberModel.updateMany(
        { familyId: id },
        { $set: { status: 'deactivated', isActive: false } },
      );

      if (existing['parentUid']) {
        await this.userModel.findByIdAndUpdate(existing['parentUid'], {
          $set: { isActive: false, status: 'deactivated' },
        });
        await this.localAuthCredentialModel.findOneAndUpdate(
          { userId: existing['parentUid'] },
          { $set: { isActive: false, disabled: true } },
        );
      }
      if (existing['parentEmail']) {
        await this.localAuthCredentialModel.findOneAndUpdate(
          { _id: String(existing['parentEmail']).toLowerCase() },
          { $set: { isActive: false, disabled: true } },
        );
      }
    }

    return { success: true, message: 'Family deleted' };
  }

  async getParentById(parentId: string): Promise<Record<string, unknown>> {
    const parent = await this.userModel.findById(parentId).lean() as Record<string, unknown> | null;
    if (!parent) throw new NotFoundException('Parent not found');
    return parent;
  }

  async getParentChildren(parentId: string): Promise<{ children: Record<string, unknown>[] }> {
    const parent = await this.userModel.findById(parentId).lean() as Record<string, unknown> | null;
    if (!parent) throw new NotFoundException('Parent not found');

    const children: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    const parentChildren = Array.isArray(parent['children']) ? parent['children'] as Record<string, unknown>[] : [];

    for (const child of parentChildren) {
      const sid = String(child['studentId'] || child['id'] || '').trim();
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      children.push({
        id: sid,
        studentId: sid,
        name: child['name'] || '',
        email: child['email'] || '',
        studentStatus: child['studentStatus'] || 'active',
        assignedTeacher: child['assignedTeacher'] || null,
        role: 'student',
      });
    }

    return { children };
  }
}
