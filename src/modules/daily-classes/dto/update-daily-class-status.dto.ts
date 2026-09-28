import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDailyClassStatusDto {
  @IsString() @IsNotEmpty() status!: string;
}
