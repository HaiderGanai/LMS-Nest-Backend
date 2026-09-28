import { Injectable } from '@nestjs/common';
import { CALL_CONSTANTS } from '../constants/call.constants';
import type { ActiveCallState } from '../interfaces/call-state.interface';

@Injectable()
export class CallStateService {
  private readonly activeCalls = new Map<string, ActiveCallState>();
  private readonly socketIdByUserId = new Map<string, string>();
  private readonly graceTimeoutByUserId = new Map<string, NodeJS.Timeout>();

  registerUserSocket(userId: string, socketId: string): void {
    this.socketIdByUserId.set(userId, socketId);
    this.clearReconnectionGracePeriod(userId);
  }

  unregisterUserSocket(userId: string, socketId: string): void {
    const currentSocketId = this.socketIdByUserId.get(userId);
    if (currentSocketId === socketId) {
      this.socketIdByUserId.delete(userId);
    }
    this.startReconnectionGracePeriod(userId);
  }

  private startReconnectionGracePeriod(userId: string): void {
    this.clearReconnectionGracePeriod(userId);
    const timeout = setTimeout(() => {
      this.graceTimeoutByUserId.delete(userId);
      for (const [callId, call] of this.activeCalls.entries()) {
        if (call.participants.includes(userId)) {
          this.activeCalls.set(callId, {
            ...call,
            status: 'disconnected',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }, CALL_CONSTANTS.reconnectionGracePeriodMs);
    this.graceTimeoutByUserId.set(userId, timeout);
  }

  private clearReconnectionGracePeriod(userId: string): void {
    const timeout = this.graceTimeoutByUserId.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.graceTimeoutByUserId.delete(userId);
    }
  }

  upsertActiveCall(callId: string, state: Partial<ActiveCallState>): ActiveCallState {
    const previousState = this.activeCalls.get(callId);
    const nextState: ActiveCallState = {
      callId,
      status: state.status || previousState?.status || 'connecting',
      teacherId: state.teacherId || previousState?.teacherId,
      studentId: state.studentId || previousState?.studentId,
      roomId: state.roomId || previousState?.roomId,
      participants: state.participants || previousState?.participants || [],
      updatedAt: new Date().toISOString(),
    };
    this.activeCalls.set(callId, nextState);
    return nextState;
  }

  deleteActiveCall(callId: string): void {
    this.activeCalls.delete(callId);
  }

  getActiveCall(callId: string): ActiveCallState | null {
    return this.activeCalls.get(callId) || null;
  }

  getActiveCalls(): ActiveCallState[] {
    return Array.from(this.activeCalls.values());
  }

  getSocketIdByUserId(userId: string): string | null {
    return this.socketIdByUserId.get(userId) || null;
  }
}
