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
import { MESSAGE_EVENTS } from '../events/message.events';
import type { SendMessageDto } from '../dto/send-message.dto';
import { ConversationsService } from '../services/conversations.service';
import { MessagesService } from '../services/messages.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly socketsByUserId = new Map<string, Set<string>>();

  constructor(
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
  ) {}

  handleConnection(socket: Socket): void {
    const userId = String(socket.handshake.query.userId || '').trim();
    if (!userId) {
      return;
    }
    const existingSockets = this.socketsByUserId.get(userId) || new Set<string>();
    existingSockets.add(socket.id);
    this.socketsByUserId.set(userId, existingSockets);
    socket.join(`user:${userId}`);
  }

  handleDisconnect(socket: Socket): void {
    for (const [userId, socketIds] of this.socketsByUserId.entries()) {
      socketIds.delete(socket.id);
      if (socketIds.size === 0) {
        this.socketsByUserId.delete(userId);
      }
    }
  }

  @SubscribeMessage('message:send')
  async sendMessage(@MessageBody() body: SendMessageDto) {
    const result = await this.messagesService.sendMessage(body as unknown as Record<string, unknown>);
    this.server.to(`user:${body.senderId}`).emit(MESSAGE_EVENTS.messageReceived, result);
    this.server.to(`user:${body.receiverId}`).emit(MESSAGE_EVENTS.messageReceived, result);
    return result;
  }

  @SubscribeMessage('message:read')
  async markRead(@MessageBody() body: { conversationId: string; userId: string }) {
    const result = await this.messagesService.markRead(body.conversationId, body.userId);
    this.server.to(`user:${body.userId}`).emit(MESSAGE_EVENTS.messageRead, {
      conversationId: body.conversationId,
      markedCount: result.markedCount,
    });
    return result;
  }

  @SubscribeMessage('conversation:list')
  async getConversations(@ConnectedSocket() socket: Socket) {
    const userId = String(socket.handshake.query.userId || '').trim();
    const result = await this.conversationsService.getConversations(userId || undefined);
    socket.emit(MESSAGE_EVENTS.conversationList, result);
    return result;
  }
}
