import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ClassHoursDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  familyId?: string;

  @IsString()
  studentId!: string;

  @IsString()
  teacherId!: string;

  @IsNumber()
  @Min(0)
  hours!: number;

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
