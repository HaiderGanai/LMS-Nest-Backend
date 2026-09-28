import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsInt()
  minAge?: number;

  @IsOptional()
  @IsEnum(['regular', 'addition', 'learning'])
  category?: 'regular' | 'addition' | 'learning';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
