import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectCommentDto {
  @ApiProperty({ description: 'Текст коментаря', example: 'Підтримую цю ініціативу!' })
  @IsString()
  @IsNotEmpty()
  content!: string;
}