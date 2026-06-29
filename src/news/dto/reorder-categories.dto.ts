import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderCategoriesDto {
  @ApiProperty({ description: 'Масив ID категорій у новому порядку', type: [String] })
  @IsArray()
  @IsString({ each: true })
  categoryIds!: string[];
}