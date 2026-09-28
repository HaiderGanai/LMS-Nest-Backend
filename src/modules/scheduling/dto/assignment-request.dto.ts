import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AssignmentRequestDto {
  @IsString()
  familyId!: string;

  @IsString()
  familyMemberId!: string;

  @IsString()
  studentDate!: string;

  @IsString()
  studentTime!: string;

  @IsArray()
  @ArrayMinSize(1)
  teacherIds!: string[];

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsArray()
  @ArrayMinSize(1)
  requiredDays!: Array<string | number>;

  @IsOptional()
  @IsString()
  studentEndTime?: string;

  @IsOptional()
  @IsString()
  studentTimezone?: string;

  @IsOptional()
  @IsString()
  studentNeeds?: string;

  @IsOptional()
  @IsString()
  requestNote?: string;

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsString()
  requestedByName?: string;
}
