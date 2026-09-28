import { Injectable, Logger } from '@nestjs/common';
import type {
  SocketIdentity,
  PresenceEntry,
  ActiveCall,
  PendingOffer,
} from '../types/signaling.types';

/**
 * Shared socket state — port of monolith global Maps.
 * Holds connectedUsers, presenceState, activeCalls, pendingOffers.
 */
@Injectable()
export class SignalingStateService {
  private readonly logger = new Logger(SignalingStateService.name);

  // socketId -> identity
  readonly connectedUsers = new Map<string, SocketIdentity>();
  // userId -> { lastSeen, socketId, role }
  readonly presenceState = new Map<string, PresenceEntry>();
  // callId -> ActiveCall
  readonly activeCalls = new Map<string, ActiveCall>();
  // userId -> PendingOffer[]
  readonly pendingOffers = new Map<string, PendingOffer[]>();
  // userId -> timeout handle (graceful offline)
  readonly pendingOfflineTimers = new Map<string, NodeJS.Timeout>();

  readonly USER_OFFLINE_GRACE_MS = Number(process.env.USER_OFFLINE_GRACE_MS || 120_000);

  // ── Connected users ────────────────────────────────────────────────────────
  setConnected(socketId: string, identity: SocketIdentity): void {
    this.connectedUsers.set(socketId, identity);
    if (identity.userId) {
      this.presenceState.set(identity.userId, {
        lastSeen: Date.now(),
        socketId,
        role: identity.role,
      });
    }
  }

  removeConnected(socketId: string): SocketIdentity | undefined {
    const identity = this.connectedUsers.get(socketId);
    this.connectedUsers.delete(socketId);
    return identity;
  }

  getConnectedBySocket(socketId: string): SocketIdentity | undefined {
    return this.connectedUsers.get(socketId);
  }

  isUserConnected(userId: string): boolean {
    if (!userId) return false;
    for (const identity of this.connectedUsers.values()) {
      if (identity.userId === userId) return true;
      if (Array.isArray(identity.additionalRooms) && identity.additionalRooms.includes(userId)) {
        return true;
      }
    }
    return false;
  }

  getSocketIdsForUser(userId: string): string[] {
    const socketIds: string[] = [];
    for (const [socketId, identity] of this.connectedUsers.entries()) {
      if (identity.userId === userId) {
        socketIds.push(socketId);
        continue;
      }
      if (Array.isArray(identity.additionalRooms) && identity.additionalRooms.includes(userId)) {
        socketIds.push(socketId);
      }
    }
    return socketIds;
  }

  touchPresence(userId: string): void {
    const existing = this.presenceState.get(userId);
    if (existing) {
      existing.lastSeen = Date.now();
      this.presenceState.set(userId, existing);
    }
  }

  // ── Pending offline timers ─────────────────────────────────────────────────
  scheduleOffline(userId: string, callback: () => void): void {
    this.cancelPendingOffline(userId);
    const timer = setTimeout(() => {
      this.pendingOfflineTimers.delete(userId);
      callback();
    }, this.USER_OFFLINE_GRACE_MS);
    this.pendingOfflineTimers.set(userId, timer);
  }

  cancelPendingOffline(userId: string): void {
    const t = this.pendingOfflineTimers.get(userId);
    if (t) {
      clearTimeout(t);
      this.pendingOfflineTimers.delete(userId);
    }
  }

  // ── Active calls ───────────────────────────────────────────────────────────
  addActiveCall(call: Partial<ActiveCall> & { callId: string }): ActiveCall {
    const existing = this.activeCalls.get(call.callId);
    const merged: ActiveCall = {
      callId: call.callId,
      callerId: call.callerId || existing?.callerId || '',
      callerName: call.callerName ?? existing?.callerName,
      recipientId: call.recipientId || existing?.recipientId || '',
      recipientName: call.recipientName ?? existing?.recipientName,
      callerSocketId: call.callerSocketId ?? existing?.callerSocketId,
      mediaMode: call.mediaMode ?? existing?.mediaMode ?? 'video',
      status: call.status || existing?.status || 'pending',
      startedAt: existing?.startedAt || new Date().toISOString(),
      parentIds: call.parentIds ?? existing?.parentIds,
      teacher: call.teacher ?? existing?.teacher,
      student: call.student ?? existing?.student,
      raw: { ...(existing?.raw || {}), ...(call.raw || {}) },
    };
    this.activeCalls.set(call.callId, merged);
    return merged;
  }

  updateCallStatus(callId: string, status: ActiveCall['status']): ActiveCall | null {
    const call = this.activeCalls.get(callId);
    if (!call) return null;
    call.status = status;
    this.activeCalls.set(callId, call);
    return call;
  }

  removeActiveCall(callId: string): void {
    this.activeCalls.delete(callId);
  }

  getActiveCall(callId: string): ActiveCall | undefined {
    return this.activeCalls.get(callId);
  }

  listActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  // ── Pending offers (offline user queue) ────────────────────────────────────
  queuePendingOffer(recipientId: string, offerData: Record<string, unknown>): void {
    const queue = this.pendingOffers.get(recipientId) || [];
    queue.push({ recipientId, offerData, queuedAt: Date.now() });
    this.pendingOffers.set(recipientId, queue);
    this.logger.log(`📬 Queued offer for offline user ${recipientId}`);
  }

  takePendingOffers(recipientId: string): PendingOffer[] {
    const queue = this.pendingOffers.get(recipientId) || [];
    this.pendingOffers.delete(recipientId);
    return queue;
  }
}
