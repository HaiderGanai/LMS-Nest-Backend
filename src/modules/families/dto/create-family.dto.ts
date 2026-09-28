import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  id!: string;

  @IsString()
  @IsOptional()
  parentUid?: string;

  @IsEmail()
  @IsOptional()
  parentEmail?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
