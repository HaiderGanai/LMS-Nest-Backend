import { IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  senderId!: string;

  @IsString()
  receiverId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  senderRole?: string;

  @IsOptional()
  @IsString()
  receiverRole?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
