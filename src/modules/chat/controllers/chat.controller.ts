import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ChatService } from '../services/chat.service';

@Controller('/api/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('/')
  async chat(@Body() body: { message?: string }, @Req() req: any) {
    if (!body.message?.trim()) {
      return { success: false, reply: 'Please type a message.' };
    }
    return this.chatService.process(body.message.trim(), req.auth?.role, req.auth);
  }
}
