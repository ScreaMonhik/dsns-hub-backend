import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Назва категорії новин', example: 'Оперативні зведення' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}