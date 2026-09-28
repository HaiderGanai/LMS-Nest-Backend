import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  clientApp?: string;
}
