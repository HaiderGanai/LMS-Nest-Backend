import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CallStateService } from '../services/call-state.service';
import type { CallOfferDto } from '../dto/call-offer.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly callStateService: CallStateService) {}

  handleConnection(socket: Socket): void {
    const userId = String(socket.handshake.query.userId || '').trim();
    if (!userId) {
      return;
    }
    this.callStateService.registerUserSocket(userId, socket.id);
    socket.join(`user:${userId}`);
  }

  handleDisconnect(socket: Socket): void {
    const userId = String(socket.handshake.query.userId || '').trim();
    if (!userId) {
      return;
    }
    this.callStateService.unregisterUserSocket(userId, socket.id);
  }

  private emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  @SubscribeMessage('call:offer')
  async sendOffer(@MessageBody() body: CallOfferDto) {
    this.callStateService.upsertActiveCall(body.callId, {
      status: 'connecting',
      participants: [body.fromUserId, body.toUserId],
    });
    this.emitToUser(body.toUserId, 'call:offer', body);
    return { success: true };
  }

  @SubscribeMessage('call:answer')
  async sendAnswer(@MessageBody() body: CallOfferDto) {
    this.callStateService.upsertActiveCall(body.callId, {
      status: 'connected',
      participants: [body.fromUserId, body.toUserId],
    });
    this.emitToUser(body.toUserId, 'call:answer', body);
    return { success: true };
  }

  @SubscribeMessage('call:ice-candidate')
  async sendIceCandidate(@MessageBody() body: CallOfferDto) {
    this.emitToUser(body.toUserId, 'call:ice-candidate', body);
    return { success: true };
  }

  @SubscribeMessage('call:end')
  async endCall(@MessageBody() body: { callId: string; fromUserId: string; toUserId: string; reason?: string }) {
    this.callStateService.upsertActiveCall(body.callId, { status: 'ended' });
    this.callStateService.deleteActiveCall(body.callId);
    this.emitToUser(body.toUserId, 'call:end', body);
    this.emitToUser(body.fromUserId, 'call:end', body);
    return { success: true };
  }

  @SubscribeMessage('call:status')
  async getCallStatus(@MessageBody() body: { callId: string }, @ConnectedSocket() socket: Socket) {
    const callState = this.callStateService.getActiveCall(body.callId);
    socket.emit('call:status', { callId: body.callId, callState });
    return { callId: body.callId, callState };
  }
}
