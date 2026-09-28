import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SignalingStateService } from '../services/signaling-state.service';
import { SignalingIdentityService } from '../services/signaling-identity.service';
import { SignalingBroadcasterService } from '../services/signaling-broadcaster.service';
import type { JoinRoomPayload, SocketIdentity } from '../types/signaling.types';

interface AuthedSocket extends Socket {
  userData?: SocketIdentity;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
})
export class SignalingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SignalingGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly state: SignalingStateService,
    private readonly identityService: SignalingIdentityService,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  afterInit(server: Server): void {
    this.broadcaster.setServer(server);
    this.logger.log('SignalingGateway initialized — broadcaster wired');
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────
  handleConnection(socket: Socket): void {
    this.logger.log(`🔌 Socket connected: ${socket.id}`);
  }

  handleDisconnect(socket: AuthedSocket): void {
    const identity = this.state.removeConnected(socket.id);
    if (!identity?.userId) return;

    this.logger.log(`🔌 Socket disconnected: ${identity.username || identity.userId}`);

    // Grace window before broadcasting offline — user may reconnect
    this.state.scheduleOffline(identity.userId, () => {
      // After grace, if still no socket for this userId — broadcast offline
      if (!this.state.isUserConnected(identity.userId)) {
        this.server.emit('user-status-changed', {
          userId: identity.userId,
          isOnline: false,
          role: identity.role,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  // ── Identity & rooms ───────────────────────────────────────────────────────
  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() userData: JoinRoomPayload = {},
  ): Promise<{ success: boolean; userId?: string; role?: string; error?: string; message?: string }> {
    const resolved = await this.identityService.resolve(socket, userData);
    if (!resolved.ok || !resolved.identity) {
      const payload = { success: false, error: resolved.code, message: resolved.message };
      socket.emit('join-room-denied', payload);
      const securityViolation =
        resolved.code === 'invalid_token' ||
        resolved.code === 'uid_mismatch' ||
        resolved.code === 'token_required';
      if (securityViolation) socket.disconnect(true);
      return payload;
    }

    const identity = resolved.identity;
    this.state.cancelPendingOffline(identity.userId);
    if (Array.isArray(identity.additionalRooms)) {
      identity.additionalRooms.forEach((rid) => this.state.cancelPendingOffline(rid));
    }

    socket.join(identity.userId);
    if (Array.isArray(identity.additionalRooms)) {
      identity.additionalRooms.forEach((rid) => socket.join(rid));
    }
    socket.userData = identity;
    this.state.setConnected(socket.id, identity);

    this.logger.log(
      `👤 ${identity.username} (${identity.role}) joined — socket=${socket.id} userId=${identity.userId}`,
    );

    // Admin sync — emit active calls + status of online users
    if (identity.role === 'admin') {
      socket.emit('active-video-calls', this.state.listActiveCalls());
      this.state.connectedUsers.forEach((user, socketId) => {
        if (['student', 'parent', 'teacher'].includes(user.role)) {
          this.server.to(socketId).emit('admin-status-changed', {
            adminId: identity.userId,
            isOnline: true,
          });
        }
      });
      // Sync online students/teachers to admin
      const synced = new Set<string>();
      const syncUser = (uid: string, role: string, name?: string, email?: string) => {
        if (!uid || synced.has(uid)) return;
        synced.add(uid);
        socket.emit('user-status-changed', {
          userId: uid,
          isOnline: true,
          role,
          name: name || null,
          email: email || null,
          timestamp: new Date().toISOString(),
        });
      };
      this.state.connectedUsers.forEach((user) => {
        if (user.role === 'student') syncUser(user.userId, 'student', user.name, user.email);
        if (user.role === 'parent' && Array.isArray(user.additionalRooms)) {
          user.additionalRooms.forEach((sid) => syncUser(sid, 'student'));
        }
        if (user.role === 'teacher') syncUser(user.userId, 'teacher', user.name, user.email);
      });
    } else {
      // Notify admins this user came online
      this.broadcastToRole('admin', 'user-status-changed', {
        userId: identity.userId,
        isOnline: true,
        role: identity.role,
        name: identity.name || null,
        email: identity.email || null,
        timestamp: new Date().toISOString(),
      });
    }

    // Replay pending offers (if user was offline when offer arrived)
    const pending = this.state.takePendingOffers(identity.userId);
    pending.forEach((p) => socket.emit('webrtc-offer', p.offerData));
    if (Array.isArray(identity.additionalRooms)) {
      identity.additionalRooms.forEach((rid) => {
        const pendingRoom = this.state.takePendingOffers(rid);
        pendingRoom.forEach((p) => socket.emit('webrtc-offer', p.offerData));
      });
    }

    return { success: true, userId: identity.userId, role: identity.role };
  }

  @SubscribeMessage('presence-ping')
  presencePing(@ConnectedSocket() socket: AuthedSocket): void {
    if (!socket.userData?.userId) return;
    this.state.touchPresence(socket.userData.userId);
  }

  // ── WebRTC signaling — direct forward to recipient room ────────────────────
  @SubscribeMessage('webrtc-offer')
  async webrtcOffer(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() offerData: any,
  ): Promise<void> {
    if (!offerData?.recipientId) return;
    this.logger.log(`📞 webrtc-offer from ${socket.userData?.username || socket.id} → ${offerData.recipientId}`);

    // ICE restart pass-through
    if (offerData?.iceRestart) {
      if (offerData.callId && this.state.activeCalls.has(offerData.callId)) {
        this.state.updateCallStatus(offerData.callId, 'reconnecting');
      }
      this.forwardToRoom(socket, offerData.recipientId, 'webrtc-offer', offerData);
      return;
    }

    // Recorder bot — just relay, no state change
    if (socket.userData?.userType === 'recorder') {
      this.forwardToRoom(socket, offerData.recipientId, 'webrtc-offer', offerData);
      return;
    }

    // Track active call
    if (!offerData.mediaMode && offerData.mode) offerData.mediaMode = offerData.mode;
    offerData.mediaMode = offerData.mediaMode || 'video';
    offerData.callerSocketId = socket.id;
    this.state.addActiveCall({
      callId: offerData.callId,
      callerId: socket.userData?.userId || '',
      callerName: socket.userData?.name,
      recipientId: offerData.recipientId,
      recipientName: offerData.recipientName,
      callerSocketId: socket.id,
      mediaMode: offerData.mediaMode,
      status: 'connecting',
      raw: offerData,
    });

    // Queue if recipient offline
    if (!this.state.isUserConnected(offerData.recipientId)) {
      this.state.queuePendingOffer(offerData.recipientId, offerData);
    }

    this.forwardToRoom(socket, offerData.recipientId, 'webrtc-offer', offerData);

    // Notify admins
    this.broadcastToRole('admin', 'admin-call-pending', {
      callId: offerData.callId,
      callerId: socket.userData?.userId,
      recipientId: offerData.recipientId,
      mediaMode: offerData.mediaMode,
    });
  }

  @SubscribeMessage('webrtc-answer')
  webrtcAnswer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() answerData: any): void {
    if (!answerData?.recipientId) return;
    this.logger.log(`📱 webrtc-answer from ${socket.userData?.username || socket.id}`);

    if (answerData?.iceRestart) {
      if (answerData.callId && this.state.activeCalls.has(answerData.callId)) {
        this.state.updateCallStatus(answerData.callId, 'connected');
      }
      this.forwardToRoom(socket, answerData.recipientId, 'webrtc-answer', answerData);
      return;
    }

    if (socket.userData?.userType === 'recorder') {
      this.forwardToRoom(socket, answerData.recipientId, 'webrtc-answer', answerData);
      return;
    }

    if (answerData.callId) {
      this.state.updateCallStatus(answerData.callId, 'connected');
    }
    this.forwardToRoom(socket, answerData.recipientId, 'webrtc-answer', answerData);

    this.broadcastToRole('admin', 'admin-call-started', {
      callId: answerData.callId,
      callerId: answerData.callerId,
      recipientId: answerData.recipientId,
    });
  }

  @SubscribeMessage('webrtc-ice-candidate')
  webrtcIceCandidate(@ConnectedSocket() socket: AuthedSocket, @MessageBody() iceData: any): void {
    if (!iceData?.recipientId) return;
    this.forwardToRoom(socket, iceData.recipientId, 'webrtc-ice-candidate', iceData);
  }

  @SubscribeMessage('webrtc-ice-restart-request')
  webrtcIceRestartRequest(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any): void {
    if (!data?.recipientId) return;
    this.forwardToRoom(socket, data.recipientId, 'webrtc-ice-restart-request', {
      ...data,
      fromUserId: socket.userData?.userId,
    });
  }

  @SubscribeMessage('webrtc-grace-window')
  webrtcGraceWindow(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any): void {
    if (!data?.recipientId) return;
    this.forwardToRoom(socket, data.recipientId, 'webrtc-grace-window', data);
  }

  @SubscribeMessage('webrtc-call-end')
  webrtcCallEnd(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any): void {
    if (!data?.callId) return;
    this.logger.log(`🛑 webrtc-call-end ${data.callId}`);
    this.state.updateCallStatus(data.callId, 'ended');
    const call = this.state.getActiveCall(data.callId);
    this.state.removeActiveCall(data.callId);

    const payload = { ...data, endedAt: new Date().toISOString() };
    if (data.recipientId) this.forwardToRoom(socket, data.recipientId, 'webrtc-call-end', payload);
    if (call?.callerId) this.forwardToRoom(socket, call.callerId, 'webrtc-call-end', payload);
    if (call?.recipientId) this.forwardToRoom(socket, call.recipientId, 'webrtc-call-end', payload);

    this.broadcastToRole('admin', 'admin-call-ended', {
      callId: data.callId,
      reason: data.reason,
      endedAt: payload.endedAt,
    });
  }

  @SubscribeMessage('webrtc-call-rejected')
  webrtcCallRejected(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any): void {
    if (!data?.callId) return;
    this.state.updateCallStatus(data.callId, 'rejected');
    const call = this.state.getActiveCall(data.callId);
    this.state.removeActiveCall(data.callId);
    if (call?.callerId) this.forwardToRoom(socket, call.callerId, 'webrtc-call-rejected', data);
    if (data.recipientId) this.forwardToRoom(socket, data.recipientId, 'webrtc-call-rejected', data);

    this.broadcastToRole('admin', 'admin-call-ended', {
      callId: data.callId,
      reason: 'rejected',
    });
  }

  @SubscribeMessage('webrtc-screen-share')
  webrtcScreenShare(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any): void {
    if (!data?.recipientId) return;
    this.forwardToRoom(socket, data.recipientId, 'webrtc-screen-share', {
      ...data,
      fromUserId: socket.userData?.userId,
    });
  }

  // ── Call lifecycle (Janus/multi-participant) ──────────────────────────────

  // Dedup window for call-notification (3s)
  private lastCallNotificationTime = new Map<string, number>();
  // Recently ended calls — suppress replayed events
  private recentlyEndedCalls = new Map<string, number>();
  private readonly RECENTLY_ENDED_TTL_MS = 60_000;

  private isRecentlyEnded(callId?: string): boolean {
    if (!callId) return false;
    const ts = this.recentlyEndedCalls.get(callId);
    if (!ts) return false;
    if (Date.now() - ts > this.RECENTLY_ENDED_TTL_MS) {
      this.recentlyEndedCalls.delete(callId);
      return false;
    }
    return true;
  }

  private markRecentlyEnded(callId: string): void {
    this.recentlyEndedCalls.set(callId, Date.now());
    setTimeout(() => this.recentlyEndedCalls.delete(callId), this.RECENTLY_ENDED_TTL_MS);
  }

  @SubscribeMessage('call-notification')
  callNotification(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (this.isRecentlyEnded(data?.callId)) return;

    // Dedup: 3s window
    if (data?.callId) {
      const last = this.lastCallNotificationTime.get(data.callId);
      const now = Date.now();
      if (last && now - last < 3000) return;
      this.lastCallNotificationTime.set(data.callId, now);
      setTimeout(() => this.lastCallNotificationTime.delete(data.callId), 120_000);
    }

    // If call already connected/active, suppress (e.g. retry from same caller)
    const existing = data?.callId ? this.state.activeCalls.get(data.callId) : null;
    const activeStatuses = new Set(['connected', 'connecting', 'reconnecting']);
    if (existing && activeStatuses.has(existing.status)) return;

    const callerId = String(data.callerId || data.teacherId || socket.userData?.userId || '').trim();
    const recipientId = String(data.recipientId || data.studentId || '').trim();
    const recipientIds = Array.from(
      new Set([
        recipientId,
        ...(Array.isArray(data.recipientIds) ? data.recipientIds.map((id: any) => String(id || '').trim()) : []),
      ].filter(Boolean)),
    ) as string[];

    if (data.callId && recipientIds.length > 0) {
      this.state.addActiveCall({
        callId: data.callId,
        callerId,
        callerName: data.callerName || data.teacherName,
        recipientId: recipientIds[0],
        recipientName: data.recipientName || data.studentName,
        callerSocketId: socket.id,
        mediaMode: (data.mode || 'video') as 'video' | 'audio',
        status: 'pending',
        teacher: { id: callerId, name: data.callerName || data.teacherName },
        student: { id: recipientIds[0], name: data.recipientName || data.studentName },
        raw: data,
      });
    }

    // Fan-out
    recipientIds.forEach((rid) => {
      if (!this.state.isUserConnected(rid)) {
        this.state.queuePendingOffer(rid, data);
        return;
      }
      this.server.to(rid).emit('call-notification', data);
    });

    this.broadcastToRole('admin', 'admin-call-pending', {
      callId: data.callId,
      callerId,
      recipientId,
      recipientIds,
      mediaMode: data.mode || 'video',
    });
  }

  @SubscribeMessage('call-started')
  callStarted(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (this.isRecentlyEnded(data?.callId)) return;
    if (data?.callId) this.state.updateCallStatus(data.callId, 'connected');

    const recipientId = String(data.recipientId || data.studentId || '').trim();
    if (recipientId) this.forwardToRoom(socket, recipientId, 'call-started', data);

    this.broadcastToRole('admin', 'admin-call-started', {
      callId: data.callId,
      callerId: data.callerId,
      recipientId,
      startedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('call-accepted')
  callAccepted(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.callId) return;
    this.state.updateCallStatus(data.callId, 'connected');

    const call = this.state.getActiveCall(data.callId);
    if (call?.callerId) this.forwardToRoom(socket, call.callerId, 'call-accepted', data);
    if (data.recipientId) this.forwardToRoom(socket, data.recipientId, 'call-accepted', data);

    this.broadcastToRole('admin', 'admin-call-started', {
      callId: data.callId,
      callerId: call?.callerId,
      recipientId: call?.recipientId,
    });
  }

  @SubscribeMessage('call-rejected')
  callRejected(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.callId) return;
    this.state.updateCallStatus(data.callId, 'rejected');
    const call = this.state.getActiveCall(data.callId);
    this.state.removeActiveCall(data.callId);
    this.markRecentlyEnded(data.callId);

    if (call?.callerId) this.forwardToRoom(socket, call.callerId, 'call-rejected', data);
    if (data.recipientId) this.forwardToRoom(socket, data.recipientId, 'call-rejected', data);

    this.broadcastToRole('admin', 'admin-call-ended', {
      callId: data.callId,
      reason: 'rejected',
      endedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('call-ended')
  callEnded(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.callId) return;
    this.state.updateCallStatus(data.callId, 'ended');
    const call = this.state.getActiveCall(data.callId);
    this.state.removeActiveCall(data.callId);
    this.markRecentlyEnded(data.callId);

    const payload = { ...data, endedAt: new Date().toISOString() };
    if (call?.callerId) this.forwardToRoom(socket, call.callerId, 'call-ended', payload);
    if (call?.recipientId) this.forwardToRoom(socket, call.recipientId, 'call-ended', payload);
    if (data.recipientId) this.forwardToRoom(socket, data.recipientId, 'call-ended', payload);

    this.broadcastToRole('admin', 'admin-call-ended', {
      callId: data.callId,
      reason: data.reason || 'ended',
      endedAt: payload.endedAt,
    });
  }

  @SubscribeMessage('call-heartbeat')
  callHeartbeat(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.callId) return;
    const call = this.state.getActiveCall(data.callId);
    if (!call) return;
    // Touch lastSeen via raw
    call.raw = { ...(call.raw || {}), lastHeartbeat: Date.now() };
    this.state.activeCalls.set(data.callId, call);

    // Broadcast heartbeat to both parties + admins
    if (call.callerId) this.forwardToRoom(socket, call.callerId, 'call-heartbeat', data);
    if (call.recipientId) this.forwardToRoom(socket, call.recipientId, 'call-heartbeat', data);
  }

  @SubscribeMessage('incoming-call-cancelled')
  incomingCallCancelled(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.recipientId) return;
    this.forwardToRoom(socket, data.recipientId, 'incoming-call-cancelled', data);
    if (data.callId) {
      this.markRecentlyEnded(data.callId);
      this.state.removeActiveCall(data.callId);
    }
  }

  // ── Admin monitoring ──────────────────────────────────────────────────────

  private requireAdmin(socket: AuthedSocket, event: string): boolean {
    if (socket.userData?.role !== 'admin') {
      this.logger.warn(`⚠️ Non-admin attempted ${event} — socket=${socket.id}`);
      return false;
    }
    return true;
  }

  @SubscribeMessage('admin-get-active-calls')
  adminGetActiveCalls(@ConnectedSocket() socket: AuthedSocket): void {
    if (!this.requireAdmin(socket, 'admin-get-active-calls')) return;
    socket.emit('active-video-calls', this.state.listActiveCalls());
  }

  @SubscribeMessage('admin-join-call')
  adminJoinCall(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() joinRequest: any = {},
  ): void {
    if (!this.requireAdmin(socket, 'admin-join-call')) return;
    const callId = joinRequest?.callId;
    if (!callId) return;

    const call = this.state.getActiveCall(callId);
    if (!call) {
      socket.emit('admin-join-denied', { callId, reason: 'Call not found' });
      return;
    }

    // Track admin in raw participants list
    const adminId = socket.userData?.userId || socket.id;
    const adminName = socket.userData?.name || socket.userData?.username || 'Admin';
    const raw = (call.raw || {}) as any;
    const participants: any[] = Array.isArray(raw.adminParticipants) ? raw.adminParticipants : [];
    const existing = participants.find((p) => p.adminId === adminId);
    if (existing) {
      existing.mode = joinRequest.mode;
      existing.joinedAt = new Date().toISOString();
    } else {
      participants.push({
        adminId,
        name: adminName,
        mode: joinRequest.mode,
        joinedAt: new Date().toISOString(),
      });
    }
    raw.adminParticipants = participants;
    call.raw = raw;
    this.state.activeCalls.set(callId, call);

    socket.emit('admin-join-approved', {
      callId,
      mode: joinRequest.mode,
      observeTransport: 'janus',
      participants: { teacher: call.teacher, student: call.student },
      janus: raw.janus || null,
      approved: true,
      timestamp: new Date().toISOString(),
    });

    // Synthetic call-accepted to caller — keeps teacher-side flow consistent
    if (call.callerId) {
      this.server.to(call.callerId).emit('call-accepted', {
        callId,
        teacherId: call.callerId,
        studentId: call.recipientId,
        acceptedBy: adminId,
        acceptedByRole: 'admin',
      });
    }
  }

  @SubscribeMessage('admin-terminate-call')
  adminTerminateCall(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() data: any = {},
  ): void {
    if (!this.requireAdmin(socket, 'admin-terminate-call')) return;
    const callId = data?.callId;
    if (!callId) return;

    const call = this.state.getActiveCall(callId);
    if (!call) {
      socket.emit('call-terminated', { callId, success: false, reason: 'Call not found' });
      return;
    }

    const endPayload = {
      callId,
      teacherId: call.callerId,
      studentId: call.recipientId,
      reason: data.reason,
      terminatedByAdmin: true,
    };

    const targets = new Set(
      [call.callerId, call.recipientId, call.callerSocketId].filter(Boolean) as string[],
    );
    targets.forEach((target) => {
      this.server.to(target).emit('webrtc-call-end', endPayload);
      this.server.to(target).emit('call-ended', endPayload);
    });

    this.state.updateCallStatus(callId, 'ended');
    this.state.removeActiveCall(callId);
    this.markRecentlyEnded(callId);

    socket.emit('call-terminated', { callId, success: true });

    this.broadcastToRole('admin', 'admin-call-ended', {
      callId,
      reason: 'terminated_by_admin',
      endedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('admin-accept-call')
  adminAcceptCall(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const callId = data?.callId;
    if (!callId) return;
    const call = this.state.getActiveCall(callId);
    if (!call) return;

    this.state.updateCallStatus(callId, 'connected');
    // Stash admin socket on raw
    const raw = (call.raw || {}) as any;
    raw.adminSocketId = socket.id;
    call.raw = raw;
    this.state.activeCalls.set(callId, call);

    if (call.callerId) {
      this.server.to(call.callerId).emit('call-accepted', {
        callId,
        answeredBy: 'admin',
      });
    }
  }

  @SubscribeMessage('admin-webrtc-offer')
  adminWebrtcOffer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!this.requireAdmin(socket, 'admin-webrtc-offer')) return;
    if (!data?.targetId) return;
    this.forwardToRoom(socket, data.targetId, 'admin-webrtc-offer', data);
  }

  @SubscribeMessage('admin-webrtc-answer')
  adminWebrtcAnswer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!this.requireAdmin(socket, 'admin-webrtc-answer')) return;
    if (!data?.targetId) return;
    this.forwardToRoom(socket, data.targetId, 'admin-webrtc-answer', data);
  }

  @SubscribeMessage('admin-ice-candidate')
  adminIceCandidate(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!this.requireAdmin(socket, 'admin-ice-candidate')) return;
    if (!data?.targetId) return;
    this.forwardToRoom(socket, data.targetId, 'admin-ice-candidate', data);
  }

  // ── Class/classroom interaction events ────────────────────────────────────

  @SubscribeMessage('student-ready')
  studentReady(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const requestedId = data?.userId || socket.userData?.userId;
    const socketUserId = socket.userData?.userId;
    const additionalRooms = socket.userData?.additionalRooms || [];
    if (!requestedId) return;
    if (!socketUserId) {
      // Pre-join, can't validate yet — log only
      this.logger.log(`⏳ student-ready before join-room — socket=${socket.id} userId=${requestedId}`);
      return;
    }
    const allowed = requestedId === socketUserId || additionalRooms.includes(requestedId);
    if (!allowed) {
      this.logger.warn(`⚠️ student-ready mismatch — socket=${socketUserId} requested=${requestedId}`);
      return;
    }
    this.state.cancelPendingOffline(requestedId);
    // Broadcast user online to admins
    this.broadcastToRole('admin', 'user-status-changed', {
      userId: requestedId,
      isOnline: true,
      role: 'student',
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('student-going-offline')
  studentGoingOffline(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const userId = String(data?.userId || '').trim();
    if (!userId) return;
    const identity = this.state.getConnectedBySocket(socket.id);
    const identityUserId = identity?.userId;
    const additionalRooms = identity?.additionalRooms || [];
    const authorized = identityUserId === userId || additionalRooms.includes(userId);
    if (!authorized) {
      this.logger.warn(`⚠️ Unauthorized student-going-offline from ${identityUserId} for ${userId}`);
      return;
    }
    // Immediate offline broadcast — skip grace period
    this.broadcastToRole('admin', 'user-status-changed', {
      userId,
      isOnline: false,
      role: 'student',
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('janus-feed-ready')
  janusFeedReady(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const callId = data?.callId;
    const feedId = Number(data?.feedId);
    const roomId = Number(data?.janusRoomId || data?.roomId);
    if (!callId || !Number.isFinite(feedId) || !Number.isFinite(roomId)) return;
    const role = String(data?.role || '').toLowerCase();

    const call = this.state.getActiveCall(callId);
    if (!call) return;
    const raw = (call.raw || {}) as any;
    raw.janus = raw.janus || { roomId: null, teacherFeedId: null, studentFeedId: null };
    raw.janus.roomId = roomId;
    if (role === 'teacher') raw.janus.teacherFeedId = feedId;
    else if (role === 'student') raw.janus.studentFeedId = feedId;
    call.raw = raw;
    this.state.activeCalls.set(callId, call);

    // Notify admins observing this call
    this.broadcastToRole('admin', 'janus-feed-ready', {
      callId,
      feedId,
      janusRoomId: roomId,
      role,
      userId: data?.userId,
    });
  }

  @SubscribeMessage('screen-share-started')
  screenShareStarted(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.roomId) return;
    this.forwardToRoom(socket, data.roomId, 'screen-share-started', data);
    this.broadcastToRole('admin', 'screen-share-started', data);
  }

  @SubscribeMessage('screen-share-stopped')
  screenShareStopped(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.roomId) return;
    this.forwardToRoom(socket, data.roomId, 'screen-share-stopped', data);
    this.broadcastToRole('admin', 'screen-share-stopped', data);
  }

  @SubscribeMessage('participant-media-state')
  participantMediaState(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const callId = String(data?.callId || '').trim();
    if (!callId) return;

    const participantRole = String(data?.participantRole || '').trim().toLowerCase();
    const payload = {
      ...data,
      callId,
      participantRole,
      audioEnabled: data.audioEnabled === true,
      videoEnabled: data.videoEnabled === true,
    };

    const call = this.state.getActiveCall(callId);
    if (call) {
      const raw = (call.raw || {}) as any;
      if (participantRole === 'teacher') {
        raw.teacherMediaState = { audioEnabled: payload.audioEnabled, videoEnabled: payload.videoEnabled };
      } else if (participantRole === 'student') {
        raw.studentMediaState = { audioEnabled: payload.audioEnabled, videoEnabled: payload.videoEnabled };
      }
      raw.lastSeen = Date.now();
      call.raw = raw;
      this.state.activeCalls.set(callId, call);
    }

    const targets = new Set(
      [call?.callerId, call?.recipientId, data?.teacherId, data?.studentId, data?.roomId]
        .filter(Boolean)
        .map(String),
    );
    targets.forEach((rid) => this.server.to(rid).emit('participant-media-state', payload));
  }

  @SubscribeMessage('video-upgrade-request')
  videoUpgradeRequest(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    const targetId = data?.recipientId;
    if (!targetId) return;
    this.server.to(String(targetId)).emit('video-upgrade-request', {
      callId: data.callId,
      enable: data.enable,
      mediaMode: data.mediaMode,
      requesterId: socket.userData?.userId,
      requesterRole: socket.userData?.role,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('student-raise-hand')
  studentRaiseHand(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() handData: any = {},
  ): { success?: boolean; error?: string } {
    const call = handData?.callId ? this.state.getActiveCall(handData.callId) : null;
    if (!call) {
      this.logger.warn(`✋ No active call for raise-hand: ${handData?.callId}`);
      return { error: 'call-not-found' };
    }
    const payload = {
      callId: handData.callId,
      studentId: handData.studentId || socket.userData?.userId,
      studentName: handData.studentName || socket.userData?.username || 'Student',
      isRaised: handData.isRaised !== false,
      timestamp: handData.timestamp || Date.now(),
    };
    if (call.callerId) this.server.to(call.callerId).emit('student-raise-hand', payload);
    this.broadcastToRole('admin', 'admin-student-raise-hand', payload);
    return { success: true };
  }

  @SubscribeMessage('hand-acknowledged')
  handAcknowledged(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: any = {}): void {
    if (!data?.studentId) return;
    const payload = {
      callId: data.callId,
      studentId: data.studentId,
      acknowledgedBy: socket.userData?.userId || 'teacher',
      acknowledgedAt: Date.now(),
    };
    this.server.to(String(data.studentId)).emit('hand-acknowledged', payload);
    this.broadcastToRole('admin', 'admin-hand-acknowledged', payload);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private forwardToRoom(socket: AuthedSocket, roomId: string, event: string, payload: unknown): void {
    socket.to(roomId).emit(event, payload);
  }

  private broadcastToRole(role: string, event: string, payload: unknown): void {
    this.state.connectedUsers.forEach((user, socketId) => {
      if (user.role === role) this.server.to(socketId).emit(event, payload);
    });
  }
}
