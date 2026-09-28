import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { SignalingStateService } from './signaling-state.service';

/**
 * Centralised emit-only broadcaster.
 * SignalingGateway registers the live Server here on init,
 * other modules inject this service to push events without the gateway dependency.
 */
@Injectable()
export class SignalingBroadcasterService {
  private readonly logger = new Logger(SignalingBroadcasterService.name);
  private server: Server | null = null;

  constructor(private readonly state: SignalingStateService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server || !userId) return;
    this.server.to(String(userId)).emit(event, payload);
  }

  emitToRole(role: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.state.connectedUsers.forEach((user, socketId) => {
      if (user.role === role) {
        this.server!.to(socketId).emit(event, payload);
      }
    });
  }

  emitToAdmins(event: string, payload: unknown): void {
    this.emitToRole('admin', event, payload);
  }

  emitToAll(event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.emit(event, payload);
  }

  // ── Convenience: alert events ───────────────────────────────────────────────
  emitSafetyAlert(targetUserId: string, payload: unknown): void {
    this.emitToUser(targetUserId, 'safety-alert', payload);
    this.emitToAdmins('safety-alert', payload);
  }

  emitAiAlert(payload: unknown): void {
    this.emitToAdmins('ai-alert', payload);
  }

  emitFlaggedTranscript(payload: unknown): void {
    this.emitToAdmins('flagged-transcript-alert', payload);
  }

  emitSttTranscript(targetUserId: string, payload: unknown): void {
    this.emitToUser(targetUserId, 'stt:transcript', payload);
  }

  // ── Announcements & status ─────────────────────────────────────────────────
  emitAnnouncementPublished(payload: unknown, targetRole?: string): void {
    if (targetRole) {
      this.emitToRole(targetRole, 'announcement-published', payload);
    } else {
      this.emitToAll('announcement-published', payload);
    }
  }

  emitUserStatusChanged(userId: string, role: string, isOnline: boolean, extras?: Record<string, unknown>): void {
    this.emitToAdmins('user-status-changed', {
      userId,
      role,
      isOnline,
      timestamp: new Date().toISOString(),
      ...(extras || {}),
    });
  }

  emitAccountStatusChanged(targetUserId: string, payload: unknown): void {
    this.emitToUser(targetUserId, 'account-status-changed', payload);
  }
}
