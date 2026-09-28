import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  clientApp?: string;
}
