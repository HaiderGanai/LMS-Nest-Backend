import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateAvailabilityDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsArray()
  @IsOptional()
  ranges?: Array<Record<string, unknown>>;

  @IsArray()
  @IsOptional()
  breaks?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  notes?: string;
}
