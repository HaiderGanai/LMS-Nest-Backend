import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import { LocalAuthCredentialModelName } from '../entities/local-auth-credential.entity';
import type { AuthResponseDto, RefreshResponseDto } from '../dto/auth-response.dto';
import type { LoginDto } from '../dto/login.dto';
import type { RefreshTokenDto } from '../dto/refresh-token.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

// ---------------------------------------------------------------------------
// Document interfaces (lean() results — no Mongoose methods needed)
// ---------------------------------------------------------------------------

interface MongoUserDocument {
  _id: string;
  email?: string;
  name?: string;
  username?: string;
  role?: string;
  password?: string;
  isActive?: boolean;
  isOnline?: boolean;
  activeStudentId?: string;
  children?: unknown[];
  createdAt?: Date;
}

interface MongoEmployeeDocument {
  _id: string;
  email?: string;
  name?: string;
  username?: string;
  role?: string;
  designation?: string;
  isActive?: boolean;
  isOnline?: boolean;
  createdAt?: Date;
}

interface MongoStudentDocument {
  _id: string;
  name?: string;
  parentId?: string;
  parentOnlineIds?: string[];
  isActive?: boolean;
  createdAt?: Date;
  [key: string]: unknown;
}

interface LocalAuthCredentialDocument {
  _id: string;
  email?: string;
  userId?: string;
  role?: string;
  name?: string;
  password?: string;
  passwordHash?: string;
  isActive?: boolean;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: escape a string for use inside a MongoDB $regex
// ---------------------------------------------------------------------------
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Helper: detect clientApp from header or body
// ---------------------------------------------------------------------------
function detectClientApp(req: Request, bodyClientApp?: string): string | null {
  const header = req.headers['x-client-app'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  if (bodyClientApp && bodyClientApp.trim()) {
    return bodyClientApp.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User')
    private readonly mongoUserModel: Model<MongoUserDocument>,

    @InjectModel('Employee')
    private readonly mongoEmployeeModel: Model<MongoEmployeeDocument>,

    @InjectModel('Student')
    private readonly mongoStudentModel: Model<MongoStudentDocument>,

    @InjectModel(LocalAuthCredentialModelName)
    private readonly localAuthCredentialModel: Model<LocalAuthCredentialDocument>,

    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  // -------------------------------------------------------------------------
  // POST /api/auth/login
  // -------------------------------------------------------------------------
  async login(body: LoginDto, req: Request): Promise<AuthResponseDto> {
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const clientApp = detectClientApp(req, body.clientApp);

    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    let uid: string | null = null;
    let userData: MongoUserDocument | MongoEmployeeDocument | MongoStudentDocument | null = null;
    let authBackend = 'mongo';
    let students: unknown[] = [];

    // ------------------------------------------------------------------
    // Step 1: Try MongoUser first (by case-insensitive email regex)
    // ------------------------------------------------------------------
    const mongoUser = await this.mongoUserModel
      .findOne({
        email: {
          $regex: `^${escapeRegex(normalizedEmail)}$`,
          $options: 'i',
        },
      })
      .lean() as MongoUserDocument | null;

    if (mongoUser) {
      uid = String(mongoUser._id);
      userData = mongoUser;

      // Verify password (bcrypt or plain) and upgrade plain → bcrypt in-place
      const passwordOk = await this.passwordService.verifyAndMaybeUpgradeUserPassword(
        mongoUser,
        password,
        async (hash) => {
          await this.mongoUserModel.updateOne(
            { _id: mongoUser._id },
            { $set: { password: hash, updatedAt: new Date() } },
          );
        },
      );

      if (!passwordOk) {
        // If the user has no password material, try LocalAuthCredential as fallback
        const hasPasswordMaterial = this.passwordService.hasPasswordMaterial(mongoUser);
        if (hasPasswordMaterial) {
          throw new UnauthorizedException('Invalid credentials');
        }

        // No password on MongoUser — check credential store
        const fallbackCred = await this.localAuthCredentialModel
          .findById(normalizedEmail)
          .lean() as LocalAuthCredentialDocument | null;

        const credOk = fallbackCred
          ? await this.passwordService.verifyAndMaybeUpgradeCredentialPassword(
              fallbackCred,
              password,
            )
          : false;

        if (!credOk) {
          throw new UnauthorizedException('Password auth required for this account');
        }

        // Sync bcrypt hash from credential to MongoUser if available
        if (
          typeof fallbackCred?.passwordHash === 'string' &&
          this.passwordService.isBcryptHash(fallbackCred.passwordHash)
        ) {
          await this.mongoUserModel.updateOne(
            { _id: uid },
            { $set: { password: fallbackCred.passwordHash, updatedAt: new Date() } },
          );
        }
      }
    } else {
      // ------------------------------------------------------------------
      // Step 2: No MongoUser found — try LocalAuthCredential
      // ------------------------------------------------------------------
      authBackend = 'mongo_local_credentials';

      let cred = await this.localAuthCredentialModel
        .findById(normalizedEmail)
        .lean() as LocalAuthCredentialDocument | null;

      if (!cred) {
        // Case-insensitive fallback on email or _id field
        cred = await this.localAuthCredentialModel
          .findOne({
            $or: [
              {
                email: {
                  $regex: `^${escapeRegex(normalizedEmail)}$`,
                  $options: 'i',
                },
              },
              {
                _id: {
                  $regex: `^${escapeRegex(normalizedEmail)}$`,
                  $options: 'i',
                },
              },
            ],
          })
          .lean() as LocalAuthCredentialDocument | null;
      }

      if (!cred) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Hard-disabled override (emergency lockout only)
      if (cred.disabled === true) {
        throw new ForbiddenException('Account disabled');
      }

      const hasPasswordMaterial = this.passwordService.hasPasswordMaterial(cred);

      if (hasPasswordMaterial) {
        const credOk = await this.passwordService.verifyAndMaybeUpgradeCredentialPassword(
          cred,
          password,
        );
        if (!credOk) {
          throw new UnauthorizedException('Invalid credentials');
        }
      } else {
        throw new UnauthorizedException('Password auth required for this account');
      }

      if (!cred.userId) {
        throw new UnauthorizedException('Credential missing user mapping');
      }

      uid = cred.userId;

      // Map credential → Employee → User → Student (in that order)
      const mappedEmployee = await this.mongoEmployeeModel
        .findById(uid)
        .lean() as MongoEmployeeDocument | null;

      if (mappedEmployee) {
        userData = mappedEmployee;
      } else {
        const mappedUser = await this.mongoUserModel
          .findById(uid)
          .lean() as MongoUserDocument | null;

        if (mappedUser) {
          userData = mappedUser;
        } else {
          const mappedStudent = await this.mongoStudentModel
            .findById(uid)
            .lean() as MongoStudentDocument | null;

          if (!mappedStudent) {
            throw new UnauthorizedException('Mapped user not found');
          }

          // Synthesize a minimal userData shape from the student doc
          userData = {
            _id: String(mappedStudent._id),
            email: (cred.email || normalizedEmail) as string,
            name: String(mappedStudent.name || cred.name || mappedStudent._id),
            username: String(mappedStudent.name || cred.name || mappedStudent._id),
            role: 'student',
            isActive: true,
          };
        }
      }
    }

    if (!uid || !userData) {
      throw new InternalServerErrorException('Authentication resolution failed');
    }

    // ------------------------------------------------------------------
    // Step 3: Resolve role (support both role and designation fields)
    // ------------------------------------------------------------------
    const normalizedRole = String(
      (userData as any).role || (userData as any).designation || '',
    ).toLowerCase();

    // ------------------------------------------------------------------
    // Step 4: Fetch children if parent role
    // ------------------------------------------------------------------
    if (normalizedRole === 'parent') {
      const studentDocs = await this.mongoStudentModel
        .find({ parentId: uid })
        .lean() as MongoStudentDocument[];
      students = studentDocs.map((doc) => ({ id: doc._id, ...doc }));
    }

    // ------------------------------------------------------------------
    // Step 5: Check isActive
    // ------------------------------------------------------------------
    const isActive = (userData as any).isActive !== false;
    if (!isActive) {
      throw new ForbiddenException('Account disabled');
    }

    // ------------------------------------------------------------------
    // Step 6: Determine activeStudentId
    // ------------------------------------------------------------------
    const firstStudent = students[0] as any;
    const activeStudentId =
      (userData as any).activeStudentId ||
      (students.length > 0 ? (firstStudent?.id || firstStudent?._id || null) : null);

    // ------------------------------------------------------------------
    // Step 7: Issue tokens
    // ------------------------------------------------------------------
    const ip = req.ip || null;
    const userAgent = (req.headers['user-agent'] as string) || null;

    const authTokens = await this.tokenService.generateAuthTokens(
      {
        uid,
        role: normalizedRole || (userData as any).role || '',
        email: (userData as any).email || normalizedEmail,
        name: (userData as any).name || (userData as any).username || uid,
      },
      { ip, userAgent, clientApp },
    );

    // ------------------------------------------------------------------
    // Step 8: Build response
    // ------------------------------------------------------------------
    return {
      uid,
      parentId: uid,
      email: (userData as any).email,
      name: (userData as any).name,
      username: (userData as any).username,
      role: normalizedRole || (userData as any).role,
      accessToken: authTokens.accessToken,
      accessTokenExpiresIn: authTokens.accessTokenExpiresIn,
      refreshToken: authTokens.refreshToken,
      refreshTokenExpiresIn: authTokens.refreshTokenExpiresIn,
      clientApp: clientApp,
      socketToken: authTokens.socketToken,
      children: (userData as any).children || [],
      students,
      activeStudentId,
      isActive,
      createdAt: (userData as any).createdAt,
      authBackend,
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/auth/refresh
  // -------------------------------------------------------------------------
  async refresh(body: RefreshTokenDto, req: Request): Promise<RefreshResponseDto> {
    const refreshToken = String(body.refreshToken || '').trim();

    if (!refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }

    const clientApp = detectClientApp(req, body.clientApp);
    const ip = req.ip || null;
    const userAgent = (req.headers['user-agent'] as string) || null;

    // rotateRefreshToken validates, revokes old, returns { userId, clientApp }
    const rotated = await this.tokenService.rotateRefreshToken(refreshToken, {
      ip,
      userAgent,
      clientApp,
    });

    // Issue a fresh token pair for the same user
    // We need basic profile fields — fetch from User or Employee
    const userDoc = await this.mongoUserModel.findById(rotated.userId).lean() as MongoUserDocument | null;
    const employeeDoc = !userDoc
      ? await this.mongoEmployeeModel.findById(rotated.userId).lean() as MongoEmployeeDocument | null
      : null;

    const profile = userDoc || employeeDoc;
    const role = String((profile as any)?.role || (profile as any)?.designation || '').toLowerCase();
    const email = (profile as any)?.email || '';
    const name = (profile as any)?.name || (profile as any)?.username || rotated.userId;

    const resolvedClientApp = rotated.clientApp || clientApp;

    const newTokens = await this.tokenService.generateAuthTokens(
      { uid: rotated.userId, role, email, name },
      { ip, userAgent, clientApp: resolvedClientApp },
    );

    return {
      accessToken: newTokens.accessToken,
      accessTokenExpiresIn: newTokens.accessTokenExpiresIn,
      refreshToken: newTokens.refreshToken,
      refreshTokenExpiresIn: newTokens.refreshTokenExpiresIn,
      clientApp: resolvedClientApp,
      socketToken: newTokens.socketToken,
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/auth/logout
  // -------------------------------------------------------------------------
  async logout(refreshToken?: string): Promise<{ success: true }> {
    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
    }
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // POST /api/auth/updateOnlineStatus  (no auth guard — public endpoint)
  // -------------------------------------------------------------------------
  async updateOnlineStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<{ success: true; userType?: string }> {
    // 1. Check if it is a student first
    const studentDoc = await this.mongoStudentModel
      .findById(userId)
      .lean() as MongoStudentDocument | null;

    if (studentDoc) {
      await this.mongoStudentModel.updateOne(
        { _id: userId },
        { $set: { isOnline, lastSeen: new Date() } },
      );
      return { success: true, userType: 'student' };
    }

    // 2. Check MongoUser
    const userDoc = await this.mongoUserModel
      .findById(userId)
      .lean() as MongoUserDocument | null;

    if (!userDoc) {
      // 3. Fall back to Employee
      const employeeDoc = await this.mongoEmployeeModel
        .findById(userId)
        .lean() as MongoEmployeeDocument | null;

      if (employeeDoc) {
        await this.mongoEmployeeModel.updateOne(
          { _id: userId },
          { $set: { isOnline, lastSeen: new Date() } },
        );
        return { success: true, userType: 'employee' };
      }

      throw new NotFoundException('User not found');
    }

    // Update MongoUser
    await this.mongoUserModel.updateOne(
      { _id: userId },
      { $set: { isOnline, lastSeen: new Date() } },
    );

    // 4. If parent, propagate online status to children's parentOnlineIds
    if (userDoc.role === 'parent' && Array.isArray(userDoc.children)) {
      for (const child of userDoc.children) {
        const childId = (child as any)?.childId || (child as any)?.studentId || null;
        if (!childId) continue;
        try {
          const childStudent = await this.mongoStudentModel
            .findById(childId)
            .lean() as MongoStudentDocument | null;

          let parentOnlineIds: string[] = Array.isArray(childStudent?.parentOnlineIds)
            ? (childStudent!.parentOnlineIds as string[])
            : [];

          if (isOnline) {
            if (!parentOnlineIds.includes(userId)) {
              parentOnlineIds = [...parentOnlineIds, userId];
            }
          } else {
            parentOnlineIds = parentOnlineIds.filter((id) => id !== userId);
          }

          await this.mongoStudentModel.updateOne(
            { _id: childId },
            { $set: { parentOnlineIds, lastParentStatusUpdate: new Date() } },
          );
        } catch {
          // Non-fatal: log and continue
        }
      }
    }

    return { success: true };
  }
}
