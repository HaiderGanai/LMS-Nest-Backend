import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as jwt from 'jsonwebtoken';
import type { Model } from 'mongoose';
import type { Socket } from 'socket.io';
import type {
  JoinRoomPayload,
  JoinRoomResolution,
  SocketIdentity,
} from '../types/signaling.types';

interface UserDoc {
  _id: string;
  role?: string;
  name?: string;
  email?: string;
  username?: string;
  parentId?: string;
  children?: Array<{ studentId?: string; childId?: string; id?: string; uid?: string; _id?: string; name?: string }>;
}

interface StudentDoc {
  _id: string;
  parentId?: string;
  name?: string;
  email?: string;
}

interface FamilyMemberDoc {
  _id: string;
  uid?: string;
  studentId?: string;
  familyId?: string;
  role?: string;
}

interface FamilyDoc {
  _id: string;
  parentUid?: string;
}

@Injectable()
export class SignalingIdentityService {
  private readonly logger = new Logger(SignalingIdentityService.name);
  private readonly accessTokenSecret = process.env.AUTH_ACCESS_TOKEN_SECRET || '';
  private readonly socketAuthRequireToken =
    String(process.env.SOCKET_AUTH_REQUIRE_TOKEN || '').toLowerCase() === 'true';

  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDoc>,
    @InjectModel('Student') private readonly studentModel: Model<StudentDoc>,
    @InjectModel('FamilyMember') private readonly familyMemberModel: Model<FamilyMemberDoc>,
    @InjectModel('Family') private readonly familyModel: Model<FamilyDoc>,
  ) {}

  private extractToken(socket: Socket, userData: JoinRoomPayload): string {
    const fromHandshake = (socket.handshake.auth as any)?.token as string | undefined;
    const fromQuery = (socket.handshake.query?.token as string | undefined) || undefined;
    const fromHeader = socket.handshake.headers?.authorization
      ? String(socket.handshake.headers.authorization).replace(/^Bearer\s+/i, '')
      : undefined;
    const fromData = userData?.token;
    return String(fromHandshake || fromHeader || fromData || fromQuery || '').trim();
  }

  async resolve(socket: Socket, userData: JoinRoomPayload = {}): Promise<JoinRoomResolution> {
    const claimedUserId = String(userData?.userId || '').trim();
    if (!claimedUserId) {
      return { ok: false, code: 'missing_userId', message: 'userId is required' };
    }

    // Recorder/bot fast path
    if (userData?.userType === 'recorder') {
      return {
        ok: true,
        identity: {
          userId: claimedUserId,
          username: userData?.username || 'Recorder',
          name: userData?.name || userData?.username || 'Recorder',
          role: 'recorder',
          userType: 'recorder',
          additionalRooms: [],
        },
      };
    }

    const token = this.extractToken(socket, userData);
    let verifiedUid: string | null = null;

    if (token) {
      // skt.* short-lived socket tokens — minimal support, just extract payload after dot
      if (token.startsWith('skt.')) {
        try {
          const parts = token.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            if (payload?.uid) verifiedUid = String(payload.uid);
          }
        } catch (_) {
          return { ok: false, code: 'invalid_token', message: 'Invalid skt token' };
        }
        if (!verifiedUid) {
          return { ok: false, code: 'invalid_token', message: 'Invalid skt token payload' };
        }
      } else {
        try {
          const decoded = jwt.verify(token, this.accessTokenSecret) as any;
          if (decoded?.typ !== 'access' || !decoded?.uid) {
            return { ok: false, code: 'invalid_token', message: 'Invalid JWT' };
          }
          // JWT path — build identity directly from claims
          return {
            ok: true,
            identity: {
              userId: decoded.uid,
              username: decoded.name || decoded.email || decoded.uid,
              name: decoded.name || decoded.email || decoded.uid,
              email: decoded.email,
              role: String(decoded.role || 'user').toLowerCase(),
              userType: decoded.role,
              additionalRooms: this.resolveAdditionalRooms(decoded, userData?.additionalRooms),
              tokenVerified: true,
            },
          };
        } catch (_) {
          return { ok: false, code: 'invalid_token', message: 'JWT verify failed' };
        }
      }
    } else if (this.socketAuthRequireToken) {
      return { ok: false, code: 'token_required', message: 'Auth token required' };
    }

    // Parent → child impersonation check
    let useStudentIdentity = false;
    if (verifiedUid && verifiedUid !== claimedUserId) {
      const parentUser = await this.userModel.findById(verifiedUid).lean();
      if (parentUser?.role === 'parent') {
        const childAuthorized = await this.checkParentChildAuth(verifiedUid, claimedUserId, parentUser);
        if (!childAuthorized) {
          return { ok: false, code: 'uid_mismatch', message: 'Not your child student' };
        }
        useStudentIdentity = true;
      } else {
        return { ok: false, code: 'uid_mismatch', message: 'Token user mismatch' };
      }
    }

    const identityUserId = useStudentIdentity ? claimedUserId : (verifiedUid || claimedUserId);
    const identity = await this.lookupIdentity(identityUserId);
    if (!identity) {
      return { ok: false, code: 'unknown_user', message: 'Unknown user identity' };
    }

    return {
      ok: true,
      identity: {
        ...identity,
        userType: userData?.userType || identity.role,
        additionalRooms: this.resolveAdditionalRooms(identity, userData?.additionalRooms),
        tokenVerified: Boolean(verifiedUid),
      },
    };
  }

  private async checkParentChildAuth(parentUid: string, claimedUserId: string, parentUser: UserDoc): Promise<boolean> {
    const parentChildren = Array.isArray(parentUser.children) ? parentUser.children : [];
    const childInParentDoc = parentChildren.find((child) => {
      const ids = [child?.studentId, child?.id, child?.uid, child?._id, child?.childId]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      return ids.includes(claimedUserId);
    });
    if (childInParentDoc) return true;

    const childStudent = await this.studentModel.findOne({ _id: claimedUserId, parentId: parentUid }).lean();
    if (childStudent) return true;

    // Family-member fallback
    const member = await this.familyMemberModel.findOne({
      role: 'student',
      $or: [{ _id: claimedUserId }, { uid: claimedUserId }, { studentId: claimedUserId }],
    }).lean();
    if (member?.familyId) {
      const familyDoc = await this.familyModel.findById(member.familyId).lean();
      if (familyDoc && String(familyDoc.parentUid || '') === String(parentUid)) return true;
    }
    return false;
  }

  private async lookupIdentity(userId: string): Promise<SocketIdentity | null> {
    const userDoc = await this.userModel.findById(userId).lean();
    if (userDoc) {
      return {
        userId: userDoc._id,
        username: userDoc.username || userDoc.name || userDoc.email || userId,
        name: userDoc.name,
        email: userDoc.email,
        role: String(userDoc.role || 'user').toLowerCase(),
      };
    }
    const studentDoc = await this.studentModel.findById(userId).lean();
    if (studentDoc) {
      return {
        userId: studentDoc._id,
        username: studentDoc.name || studentDoc.email || userId,
        name: studentDoc.name,
        email: studentDoc.email,
        role: 'student',
      };
    }
    return null;
  }

  private resolveAdditionalRooms(identity: any, requested?: string[]): string[] {
    const rooms = new Set<string>();
    if (Array.isArray(requested)) {
      requested.forEach((r) => {
        if (r) rooms.add(String(r).trim());
      });
    }
    // Parents auto-join child rooms
    if (identity?.role === 'parent' && Array.isArray(identity?.children)) {
      identity.children.forEach((c: any) => {
        const id = c?.studentId || c?.id || c?.uid || c?._id;
        if (id) rooms.add(String(id).trim());
      });
    }
    return Array.from(rooms);
  }
}
