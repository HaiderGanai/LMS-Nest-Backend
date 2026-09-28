import { IsNumber, IsOptional, IsString } from 'class-validator';

export class SalaryAdvanceDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  employeeId!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  requestedDate?: string;

  @IsOptional()
  @IsString()
  monthKey?: string;
}
