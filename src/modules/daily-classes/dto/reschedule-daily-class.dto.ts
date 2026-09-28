import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RescheduleDailyClassDto {
  @IsString() @IsNotEmpty() newDate!: string;
  @IsString() @IsNotEmpty() newStartTime!: string;
  @IsOptional() @IsString() businessTimezone?: string;
}
