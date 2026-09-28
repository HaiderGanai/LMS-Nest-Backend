import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { MessagesController } from './controllers/messages.controller';
import { ConversationModelName, ConversationSchema } from './entities/conversation.entity';
import { MessageModelName, MessageSchema } from './entities/message.entity';
import { MessagesGateway } from './gateways/messages.gateway';
import { CommunicationsRepository } from './repositories/communications.repository';
import { MessagesRepository } from './repositories/messages.repository';
import { ConversationsService } from './services/conversations.service';
import { MessagesService } from './services/messages.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: MessageModelName, schema: MessageSchema },
      { name: ConversationModelName, schema: ConversationSchema },
    ]),
  ],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    ConversationsService,
    MessagesRepository,
    CommunicationsRepository,
    MessagesGateway,
  ],
  exports: [MessagesService, ConversationsService, MessagesGateway],
})
export class MessagesModule {}
