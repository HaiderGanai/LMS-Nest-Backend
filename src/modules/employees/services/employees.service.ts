import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import { AUTH_CONSTANTS } from '../../auth/constants/auth.constants';

// ---------------------------------------------------------------------------
// Interfaces (lean documents — no Mongoose overhead needed at runtime)
// ---------------------------------------------------------------------------

interface EmployeeDocument {
  _id: string;
  uid?: string;
  email?: string;
  loginEmail?: string;
  name?: string;
  designation?: string;
  role?: string;
  status?: string;
  isActive?: boolean;
  raw?: Record<string, unknown>;
  createdAt?: Date;
  [key: string]: unknown;
}

interface StudentDocument {
  _id: string;
  teacherId?: string;
  assignedTeacher?: string;
}

interface UserDocument {
  _id: string;
  uid?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  status?: string;
}

interface LocalAuthCredentialDocument {
  _id: string;
  userId?: string;
  email?: string;
  role?: string;
  name?: string;
  passwordHash?: string;
  isActive?: boolean;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fields that must be mirrored from top-level into raw.fieldName on update */
const RAW_MIRRORED_FIELDS = [
  'name',
  'fatherOrHusbandName',
  'cnic',
  'address',
  'city',
  'mobile',
  'altMobile',
  'email',
  'secondaryEmail',
  'dob',
  'gender',
  'maritalStatus',
  'experience',
  'qualification',
  'designation',
  'salaryPackage',
  'salaryAmount',
  'hourlyRate',
  'perStudentRate',
  'percentageRate',
  'timezone',
  'category',
  'nationality',
  'joiningDate',
  'status',
  'agreementSigned',
  'witness1Submitted',
  'witness2Submitted',
  'securityChequeSubmitted',
] as const;

function generateAdminTempPassword(): string {
  return crypto.randomBytes(6).toString('hex'); // 12-char hex
}

function flattenEmployee(e: EmployeeDocument): Record<string, unknown> {
  const flattened: Record<string, unknown> = { id: e._id, ...e };
  if (e.raw && typeof e.raw === 'object') {
    Object.assign(flattened, e.raw);
  }
  return flattened;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel('Employee')
    private readonly employeeModel: Model<EmployeeDocument>,

    @InjectModel('Student')
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,

    @InjectModel('LocalAuthCredential')
    private readonly localAuthCredentialModel: Model<LocalAuthCredentialDocument>,
  ) {}

  // ── 1. List employees ────────────────────────────────────────────────────

  async getEmployees(query: { designation?: string }): Promise<{ success: true; employees: Record<string, unknown>[] }> {
    const filter: Record<string, unknown> = {};
    if (query.designation) filter.designation = query.designation;

    const employees = await this.employeeModel.find(filter).sort({ createdAt: -1 }).lean() as EmployeeDocument[];

    const employeesWithCounts = await Promise.all(
      employees.map(async (e) => {
        let studentCount = 0;
        if (e.designation === 'teacher' && e.uid) {
          studentCount = await this.studentModel.countDocuments({
            $or: [
              { teacherId: e.uid },
              { assignedTeacher: e.uid },
            ],
          });
        }

        const flattened = flattenEmployee(e);
        flattened.studentCount = studentCount;
        // isOnline: NestJS has no socket presence registry, always false
        flattened.isOnline = false;

        return flattened;
      }),
    );

    return { success: true, employees: employeesWithCounts };
  }

  // ── 2. Stats ─────────────────────────────────────────────────────────────

  async getEmployeeStats(): Promise<{ success: true; stats: Record<string, unknown> }> {
    const employees = await this.employeeModel.find({}).lean() as EmployeeDocument[];

    const stats: Record<string, unknown> = {
      total: employees.length,
      active: employees.filter((e) => e.status === 'active').length,
      onTraining: employees.filter((e) => e.status === 'on_training').length,
      inactive: employees.filter((e) => e.status === 'inactive').length,
      byDesignation: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    employees.forEach((e) => {
      if (e.designation) {
        (stats.byDesignation as Record<string, number>)[e.designation] =
          ((stats.byDesignation as Record<string, number>)[e.designation] ?? 0) + 1;
      }
      if (e.status) {
        (stats.byStatus as Record<string, number>)[e.status] =
          ((stats.byStatus as Record<string, number>)[e.status] ?? 0) + 1;
      }
    });

    return { success: true, stats };
  }

  // ── 3. Get single employee ───────────────────────────────────────────────

  async getEmployeeById(id: string): Promise<{ success: true; employee: Record<string, unknown> }> {
    const employee = await this.employeeModel.findById(id).lean() as EmployeeDocument | null;
    if (!employee) throw new NotFoundException('Employee not found');

    return { success: true, employee: flattenEmployee(employee) };
  }

  // ── 4. Agreement endpoint ────────────────────────────────────────────────

  async updateAgreement(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; message: string }> {
    const profileFields = [
      'fatherOrHusbandName',
      'cnic',
      'address',
      'salaryAmount',
      'hourlyRate',
      'nationality',
      'gender',
      'maritalStatus',
    ] as const;

    const updateOps: Record<string, unknown> = {};

    for (const field of profileFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        const value = String(body[field] ?? '').trim();
        updateOps[field] = value;
        updateOps[`raw.${field}`] = value;
      }
    }

    if (body.agreementDate) {
      updateOps['raw.lastAgreementDate'] = String(body.agreementDate).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'witness1Name')) {
      const value = String(body.witness1Name ?? '').trim();
      updateOps['witnessDetails.name'] = value;
      updateOps['raw.witnessDetails.name'] = value;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'witness2Name')) {
      const value = String(body.witness2Name ?? '').trim();
      updateOps['secondWitnessDetails.name'] = value;
      updateOps['raw.secondWitnessDetails.name'] = value;
    }

    if (Object.keys(updateOps).length > 0) {
      await this.employeeModel.findByIdAndUpdate(id, { $set: updateOps }, { new: true });
    }

    const employee = await this.employeeModel.findById(id).lean();
    if (!employee) throw new NotFoundException('Employee not found');

    return { success: true, message: 'Agreement generation not implemented' };
  }

  // ── 5. Create employee ───────────────────────────────────────────────────

  async createEmployee(body: Record<string, unknown>): Promise<{ success: true; employee: Record<string, unknown>; tempPassword: string }> {
    const { email, name, designation, role, status, password, ...rest } = body as {
      email: string;
      name: string;
      designation?: string;
      role?: string;
      status?: string;
      password?: string;
      [key: string]: unknown;
    };

    if (!email || !name) {
      throw new BadRequestException('email and name are required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Email collision check
    const collision = await this.findEmployeeAccountCollisionByEmail(normalizedEmail);
    if (collision) {
      throw new ConflictException({
        message: `An account with email '${normalizedEmail}' already exists`,
        details: collision,
      });
    }

    const uid = crypto.randomBytes(16).toString('hex');
    const effectiveRole = (role || designation || 'teacher') as string;
    const effectiveDesignation = (designation || role || 'teacher') as string;
    const effectiveStatus = (status || 'on_training') as string;

    await this.employeeModel.findOneAndUpdate(
      { _id: uid },
      {
        $setOnInsert: {
          _id: uid,
          uid,
          email: normalizedEmail,
          name,
          designation: effectiveDesignation,
          role: effectiveRole,
          status: effectiveStatus,
          isActive: effectiveStatus !== 'inactive',
          raw: rest,
        },
      },
      { upsert: true, new: true },
    );

    const tempPassword = (password as string | undefined) || generateAdminTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, AUTH_CONSTANTS.bcryptRounds);

    await this.localAuthCredentialModel.findOneAndUpdate(
      { _id: normalizedEmail },
      {
        $setOnInsert: {
          _id: normalizedEmail,
          email: normalizedEmail,
          userId: uid,
          role: effectiveRole,
          name,
          passwordHash,
          isActive: true,
          disabled: false,
        },
      },
      { upsert: true, new: true },
    );

    // Store plain password in employee raw data for admin reference
    await this.employeeModel.findByIdAndUpdate(uid, {
      $set: { 'raw.tempPassword': tempPassword },
    });

    const employee = await this.employeeModel.findById(uid).lean() as EmployeeDocument;
    return { success: true, employee: { id: uid, ...employee }, tempPassword };
  }

  // ── 6. Update employee ───────────────────────────────────────────────────

  async updateEmployee(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: true; employee: Record<string, unknown> }> {
    const existingEmployee = await this.employeeModel.findById(id).lean() as EmployeeDocument | null;
    if (!existingEmployee) throw new NotFoundException('Employee not found');

    const { raw: rawUpdate, ...topLevel } = body as { raw?: Record<string, unknown>; [key: string]: unknown };

    const updateOps: Record<string, unknown> = {};

    // Apply top-level fields (skip _id)
    for (const [k, v] of Object.entries(topLevel)) {
      if (k !== '_id') updateOps[k] = v;
    }

    // Apply raw sub-fields as dot-notation keys
    if (rawUpdate && typeof rawUpdate === 'object') {
      for (const [k, v] of Object.entries(rawUpdate)) {
        updateOps[`raw.${k}`] = v;
      }
    }

    // Mirror top-level fields into raw
    for (const field of RAW_MIRRORED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updateOps, field)) {
        updateOps[`raw.${field}`] = updateOps[field];
      }
    }

    // Email collision check
    if (Object.prototype.hasOwnProperty.call(updateOps, 'email')) {
      const normalizedEmail = String(updateOps.email ?? '').trim().toLowerCase();
      if (!normalizedEmail) {
        throw new BadRequestException('email cannot be empty');
      }
      const currentEmail = String(
        existingEmployee.email ?? (existingEmployee.raw as Record<string, unknown> | undefined)?.email ?? '',
      )
        .trim()
        .toLowerCase();

      if (normalizedEmail !== currentEmail) {
        const collision = await this.findEmployeeAccountCollisionByEmail(normalizedEmail, { excludeEmployeeId: id });
        if (collision) {
          throw new ConflictException({
            message: `An account with email '${normalizedEmail}' already exists`,
            details: collision,
          });
        }
      }
      updateOps.email = normalizedEmail;
      updateOps['raw.email'] = normalizedEmail;
    }

    const updated = await this.employeeModel
      .findByIdAndUpdate(id, { $set: updateOps }, { new: true })
      .lean() as EmployeeDocument;

    return { success: true, employee: { id: updated._id, ...updated } };
  }

  // ── 7. Update status (with cascade) ─────────────────────────────────────

  async updateEmployeeStatus(
    id: string,
    body: { status: string; reason?: string },
    actorUid?: string,
  ): Promise<{ success: true; employee: Record<string, unknown> }> {
    const { status, reason } = body;
    if (!status) throw new BadRequestException('status is required');

    const employee = await this.employeeModel.findById(id).lean() as EmployeeDocument | null;
    if (!employee) throw new NotFoundException('Employee not found');

    const currentStatus = String(employee.status ?? '').toLowerCase();
    const nextStatus = String(status).toLowerCase();
    const isDemotionFromActive = currentStatus === 'active' && nextStatus !== 'active';

    if (isDemotionFromActive) {
      // Find linked teacher User for cascade disable
      const escapedEmail = String(employee.email ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkedTeacherUser = await this.userModel
        .findOne({
          role: 'teacher',
          $or: [
            { _id: String(employee.uid ?? employee._id ?? '').trim() },
            { uid: String(employee.uid ?? employee._id ?? '').trim() },
            ...(escapedEmail ? [{ email: { $regex: `^${escapedEmail}$`, $options: 'i' } }] : []),
          ],
        })
        .lean() as UserDocument | null;

      if (linkedTeacherUser) {
        await this.userModel.updateOne(
          { _id: linkedTeacherUser._id },
          { $set: { isActive: false, status: nextStatus } },
        );
      }

      // Disable LocalAuthCredential
      const credEmail = String(employee.email ?? employee.loginEmail ?? '').toLowerCase().trim();
      await Promise.all([
        this.localAuthCredentialModel.updateMany(
          { userId: id },
          { $set: { isActive: false, disabled: true } },
        ),
        credEmail
          ? this.localAuthCredentialModel.updateMany(
              { _id: credEmail },
              { $set: { isActive: false, disabled: true } },
            )
          : Promise.resolve(),
      ]);
    }

    const statusEntry = {
      from: employee.status,
      to: status,
      changedAt: new Date().toISOString(),
      changedBy: actorUid ?? 'admin',
      reason: reason ?? '',
    };

    const updated = await this.employeeModel
      .findByIdAndUpdate(
        id,
        {
          $set: { status, isActive: status === 'active', 'raw.status': status, 'raw.isActive': status === 'active' },
          $push: { 'raw.statusHistory': statusEntry },
        },
        { new: true },
      )
      .lean() as EmployeeDocument;

    // Sync credential active state for non-demotion cases too
    if (!isDemotionFromActive) {
      try {
        const credEmail = String(updated.email ?? updated.loginEmail ?? '').toLowerCase().trim();
        await Promise.all([
          this.localAuthCredentialModel.updateMany(
            { userId: id },
            { $set: { isActive: status === 'active', disabled: status !== 'active' } },
          ),
          credEmail
            ? this.localAuthCredentialModel.updateMany(
                { _id: credEmail },
                { $set: { isActive: status === 'active', disabled: status !== 'active' } },
              )
            : Promise.resolve(),
        ]);
      } catch {
        // Non-fatal — credential sync failure shouldn't block status update
      }
    }

    return { success: true, employee: { id: updated._id, ...updated } };
  }

  // ── 8. Enable login ──────────────────────────────────────────────────────

  async enableLogin(id: string): Promise<{ success: true; updated: number }> {
    const employee = await this.employeeModel.findById(id).lean() as EmployeeDocument | null;
    if (!employee) throw new NotFoundException('Employee not found');

    const normalizedEmail = String(employee.email ?? employee.loginEmail ?? '').toLowerCase().trim();

    const [byUserId, byEmail] = await Promise.all([
      this.localAuthCredentialModel.updateMany(
        { userId: id },
        { $set: { isActive: true, disabled: false } },
      ),
      normalizedEmail
        ? this.localAuthCredentialModel.updateMany(
            { _id: normalizedEmail },
            { $set: { isActive: true, disabled: false, userId: id } },
          )
        : Promise.resolve({ matchedCount: 0, modifiedCount: 0 }),
    ]);

    const totalMatched = byUserId.matchedCount + (byEmail as { matchedCount: number }).matchedCount;
    if (totalMatched === 0) {
      throw new NotFoundException('No login credential found for this employee');
    }

    return {
      success: true,
      updated: byUserId.modifiedCount + (byEmail as { modifiedCount: number }).modifiedCount,
    };
  }

  // ── 9. Reset password ────────────────────────────────────────────────────

  async resetPassword(id: string, body: { password?: string }): Promise<{ success: true; newPassword: string; message: string }> {
    const employee = await this.employeeModel.findById(id).lean() as EmployeeDocument | null;
    if (!employee) throw new NotFoundException('Employee not found');

    const newPassword = body.password || generateAdminTempPassword();
    const passwordHash = await bcrypt.hash(newPassword, AUTH_CONSTANTS.bcryptRounds);
    const normalizedEmail = String(employee.email ?? '').trim().toLowerCase();

    let cred: LocalAuthCredentialDocument | null = null;

    // Try by userId first
    if (id) {
      cred = await this.localAuthCredentialModel.findOneAndUpdate(
        { userId: id },
        { $set: { passwordHash, isActive: true, disabled: false } },
        { new: true },
      ).lean() as LocalAuthCredentialDocument | null;
    }

    // Try by email (_id)
    if (!cred && normalizedEmail) {
      cred = await this.localAuthCredentialModel.findOneAndUpdate(
        { _id: normalizedEmail },
        { $set: { passwordHash, isActive: true, disabled: false, userId: id } },
        { new: true },
      ).lean() as LocalAuthCredentialDocument | null;
    }

    // Create credential if none exists
    if (!cred && normalizedEmail) {
      cred = await this.localAuthCredentialModel.findOneAndUpdate(
        { _id: normalizedEmail },
        {
          $setOnInsert: {
            _id: normalizedEmail,
            email: normalizedEmail,
            userId: id,
            role: (employee.designation ?? employee.role ?? 'teacher') as string,
            name: (employee.name ?? '') as string,
            isActive: true,
            disabled: false,
          },
          $set: { passwordHash },
        },
        { upsert: true, new: true },
      ).lean() as LocalAuthCredentialDocument | null;
    }

    if (!cred) {
      throw new InternalServerErrorException('Failed to update or create login credential');
    }

    // Store plain password in employee raw data for admin reference
    await this.employeeModel.findByIdAndUpdate(id, {
      $set: { 'raw.tempPassword': newPassword },
    });

    return { success: true, newPassword, message: 'Password reset successfully' };
  }

  // ── 10. Delete (soft) ────────────────────────────────────────────────────

  async deleteEmployee(id: string): Promise<{ success: true; message: string }> {
    const updated = await this.employeeModel
      .findByIdAndUpdate(id, { $set: { isActive: false, status: 'inactive', 'raw.status': 'inactive', 'raw.isActive': false } }, { new: true })
      .lean() as EmployeeDocument | null;

    if (!updated) throw new NotFoundException('Employee not found');

    const credEmail = String(updated.email ?? updated.loginEmail ?? '').toLowerCase().trim();

    await Promise.all([
      this.localAuthCredentialModel.updateMany(
        { userId: id },
        { $set: { isActive: false, disabled: true } },
      ),
      credEmail
        ? this.localAuthCredentialModel.updateMany(
            { _id: credEmail },
            { $set: { isActive: false, disabled: true } },
          )
        : Promise.resolve(),
    ]);

    return { success: true, message: 'Employee deactivated' };
  }

  // ── Private: email collision check ───────────────────────────────────────

  private async findEmployeeAccountCollisionByEmail(
    normalizedEmail: string,
    options: { excludeEmployeeId?: string } = {},
  ): Promise<{
    type: 'employee' | 'credential';
    employeeId: string | null;
    email: string;
    name: string | null;
  } | null> {
    if (!normalizedEmail) return null;

    const normalizeComparableEmail = (value: unknown): string =>
      String(value ?? '').trim().toLowerCase();

    const targetEmail = normalizeComparableEmail(normalizedEmail);
    const excluded = String(options.excludeEmployeeId ?? '').trim();

    const escapedForRegex = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailRegex = {
      $regex: `^\\s*${escapedForRegex}\\s*$`,
      $options: 'i',
    };

    const employeeFilter: Record<string, unknown> = {
      $or: [
        { email: emailRegex },
        { 'raw.email': emailRegex },
      ],
    };
    if (excluded) {
      employeeFilter._id = { $ne: excluded };
    }

    const existingEmployee = await this.employeeModel.findOne(employeeFilter).lean() as EmployeeDocument | null;
    if (existingEmployee) {
      return {
        type: 'employee',
        employeeId: String(existingEmployee._id),
        email: (existingEmployee.email as string | undefined) ?? normalizedEmail,
        name: (existingEmployee.name as string | undefined) ?? (existingEmployee.raw as Record<string, unknown> | undefined)?.name as string | null ?? null,
      };
    }

    // Extra guard: scan normalized values to catch legacy records with inconsistent formatting
    const allEmployees = await this.employeeModel
      .find({}, { _id: 1, email: 1, raw: 1, name: 1 })
      .lean() as EmployeeDocument[];

    const normalizedCollision = allEmployees.find((employee) => {
      if (!employee) return false;
      if (excluded && String(employee._id ?? '').trim() === excluded) return false;
      const candidates = [
        normalizeComparableEmail(employee.email),
        normalizeComparableEmail((employee.raw as Record<string, unknown> | undefined)?.email),
      ].filter(Boolean);
      return candidates.includes(targetEmail);
    });

    if (normalizedCollision) {
      return {
        type: 'employee',
        employeeId: String(normalizedCollision._id),
        email: (normalizedCollision.email as string | undefined) ?? normalizedEmail,
        name: (normalizedCollision.name as string | undefined) ?? (normalizedCollision.raw as Record<string, unknown> | undefined)?.name as string | null ?? null,
      };
    }

    // Check LocalAuthCredential
    const existingCredential = await this.localAuthCredentialModel
      .findById(normalizedEmail)
      .lean() as LocalAuthCredentialDocument | null;

    if (existingCredential && String(existingCredential.userId ?? '').trim() !== excluded) {
      return {
        type: 'credential',
        employeeId: existingCredential.userId ?? null,
        email: normalizedEmail,
        name: existingCredential.name ?? null,
      };
    }

    return null;
  }
}
