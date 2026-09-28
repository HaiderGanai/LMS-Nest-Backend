import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateComplaintDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  complainantId?: string;

  @IsOptional()
  @IsString()
  complainantType?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}
