import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AssignCoursesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  courseIds!: string[];
}
