import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateClassHoursDto {
  @IsOptional()
  @IsString()
  familyId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;

  @IsOptional()
  @IsString()
  monthKey?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
