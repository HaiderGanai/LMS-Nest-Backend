import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  id!: string;

  @IsString()
  familyId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  monthKey?: string;
}
