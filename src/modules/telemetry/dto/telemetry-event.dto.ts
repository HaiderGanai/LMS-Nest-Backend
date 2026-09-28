import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class TelemetryEventDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  callId!: string;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsNumber()
  janusRoomId?: number;

  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  app?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  eventAt?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
