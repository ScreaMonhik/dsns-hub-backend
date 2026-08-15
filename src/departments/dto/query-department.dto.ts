import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDepartmentDto {
  @ApiPropertyOptional({ description: 'Пошуковий запит по назві' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Номер сторінки', example: '1' })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Кількість елементів на сторінці', example: '20' })
  @IsOptional()
  limit?: string;
}