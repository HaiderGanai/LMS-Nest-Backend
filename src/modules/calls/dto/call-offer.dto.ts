import { IsOptional, IsString } from 'class-validator';

export class CallOfferDto {
  @IsString()
  callId!: string;

  @IsString()
  fromUserId!: string;

  @IsString()
  toUserId!: string;

  @IsOptional()
  offer?: Record<string, unknown>;

  @IsOptional()
  answer?: Record<string, unknown>;

  @IsOptional()
  candidate?: Record<string, unknown>;
}
