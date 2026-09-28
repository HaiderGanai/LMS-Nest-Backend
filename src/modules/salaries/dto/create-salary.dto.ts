import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSalaryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  bonuses?: number;

  @IsOptional()
  @IsNumber()
  deductions?: number;

  @IsOptional()
  @IsNumber()
  grossAmount?: number;

  @IsOptional()
  @IsNumber()
  netAmount?: number;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
