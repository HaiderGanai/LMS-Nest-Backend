import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MinPermission } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../../shared/guards/min-permission.guard';
import { ConversationsService } from '../services/conversations.service';
import { MessagesService } from '../services/messages.service';

@Controller()
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
  ) {}

  // GET /api/messages — MinPermission(90): admin list
  @Get('/api/messages')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async getMessages(@Query() query: Record<string, string>) {
    return this.messagesService.getMessages(query);
  }

  // PUT /api/messages/:id — MinPermission(90)
  @Put('/api/messages/:id')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async updateMessage(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.messagesService.updateMessage(id, body);
  }

  // DELETE /api/messages/:id — MinPermission(90)
  @Delete('/api/messages/:id')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(90)
  async deleteMessage(@Param('id') id: string) {
    return this.messagesService.deleteMessage(id);
  }

  // POST /api/messages/send — no auth (called by teacher/student clients)
  @Post('/api/messages/send')
  @HttpCode(200)
  async sendMessage(@Body() body: Record<string, unknown>) {
    return this.messagesService.sendMessage(body);
  }

  // POST /api/messages/push — no auth (Firebase push notification entry)
  @Post('/api/messages/push')
  @HttpCode(200)
  async pushMessage(@Body() body: Record<string, unknown>) {
    return this.messagesService.sendMessage({ ...body, channel: 'push' });
  }

  // POST /api/messages/mark-read — no auth
  @Post('/api/messages/mark-read')
  @HttpCode(200)
  async markRead(@Body() body: { conversationId: string; userId: string }) {
    return this.messagesService.markRead(body.conversationId, body.userId);
  }

  // GET /api/student/:studentId/messages — no auth
  @Get('/api/student/:studentId/messages')
  async getStudentMessages(
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getStudentMessages(studentId, parseInt(limit || '') || 50);
  }

  // GET /api/student/:studentId/conversations — no auth
  @Get('/api/student/:studentId/conversations')
  async getStudentConversations(@Param('studentId') studentId: string) {
    return this.messagesService.getStudentConversations(studentId);
  }

  // GET /api/conversation/:conversationId/messages — no auth
  @Get('/api/conversation/:conversationId/messages')
  async getConversationMessages(@Param('conversationId') conversationId: string) {
    return this.messagesService.getConversationMessages(conversationId);
  }
}
