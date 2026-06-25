import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNewsCommentDto {
  @ApiProperty({ description: 'Текст коментаря', example: 'Дуже корисна інформація, дякую!' })
  @IsString()
  @IsNotEmpty()
  content!: string;
}