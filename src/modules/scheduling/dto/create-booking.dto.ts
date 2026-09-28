import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  familyId!: string;

  @IsString()
  familyMemberId!: string;

  @IsString()
  teacherId!: string;

  @IsString()
  studentDate!: string;

  @IsString()
  studentTime!: string;

  @IsString()
  @IsOptional()
  studentTimezone?: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
