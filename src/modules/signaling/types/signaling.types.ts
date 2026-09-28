// Shared socket state types — mirrors monolith
export interface SocketIdentity {
  userId: string;
  username?: string;
  email?: string;
  name?: string;
  role: 'admin' | 'parent' | 'student' | 'teacher' | 'recorder' | string;
  userType?: string;
  tokenVerified?: boolean;
  additionalRooms?: string[];
}

export interface PresenceEntry {
  lastSeen: number;
  socketId: string;
  role: string;
}

export interface ActiveCall {
  callId: string;
  callerId: string;
  callerName?: string;
  recipientId: string;
  recipientName?: string;
  callerSocketId?: string;
  mediaMode?: 'video' | 'audio';
  status:
    | 'pending'
    | 'ringing'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'ended'
    | 'rejected';
  startedAt: string;
  parentIds?: string[];
  teacher?: { id: string; name?: string };
  student?: { id: string; name?: string };
  raw?: Record<string, unknown>;
}

export interface PendingOffer {
  recipientId: string;
  offerData: Record<string, unknown>;
  queuedAt: number;
}

export interface JoinRoomPayload {
  userId?: string;
  username?: string;
  email?: string;
  name?: string;
  role?: string;
  userType?: string;
  token?: string;
  additionalRooms?: string[];
}

export interface JoinRoomResolution {
  ok: boolean;
  identity?: SocketIdentity;
  code?: 'invalid_token' | 'uid_mismatch' | 'token_required' | 'unknown_user' | 'missing_userId';
  message?: string;
}
