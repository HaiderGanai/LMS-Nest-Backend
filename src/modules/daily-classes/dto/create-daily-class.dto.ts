import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDailyClassDto {
  @IsOptional() @IsString() _id?: string;
  @IsOptional() @IsString() classType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() teacherUid?: string;
  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsString() teacherTimezone?: string;
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() studentName?: string;
  @IsOptional() @IsString() studentTimezone?: string;
  @IsOptional() @IsString() familyId?: string;
  @IsOptional() @IsString() startUtc?: string;
  @IsOptional() @IsString() endUtc?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsString() adminDate?: string;
  @IsOptional() @IsString() adminStartTime?: string;
  @IsOptional() @IsString() adminEndTime?: string;
  @IsOptional() @IsString() teacherLocalDate?: string;
  @IsOptional() @IsString() teacherLocalStartTime?: string;
  @IsOptional() @IsString() teacherLocalEndTime?: string;
  @IsOptional() @IsString() studentLocalDate?: string;
  @IsOptional() @IsString() studentLocalStartTime?: string;
  @IsOptional() @IsString() studentLocalEndTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() raw?: unknown;
}
