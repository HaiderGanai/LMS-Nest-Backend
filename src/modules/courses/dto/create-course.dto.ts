import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  name!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minAge?: number;

  @IsEnum(['regular', 'addition', 'learning'])
  category!: 'regular' | 'addition' | 'learning';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;
}
