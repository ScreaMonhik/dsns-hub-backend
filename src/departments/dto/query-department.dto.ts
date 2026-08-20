import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDepartmentDto {
  @ApiPropertyOptional({ description: 'ID батьківського підрозділу (передайте "null" для кореневих областей/органів)', example: '737306c4-560a-4f7b-b941-f582a233d5ef' })
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Пошуковий запит по назві' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Номер сторінки', example: '1' })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Кількість елементів на сторінці', example: '100' })
  @IsOptional()
  limit?: string;
}