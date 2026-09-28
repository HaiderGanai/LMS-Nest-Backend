export class MessageResponseDto {
  id!: string;
  conversationId!: string;
  senderId!: string;
  receiverId!: string;
  content!: string;
  type!: string;
  isRead!: boolean;
  timestamp!: string | Date;
}
