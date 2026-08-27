import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BroadcastSeverity } from '@prisma/client';

export class QueryEmergencyBroadcastDto {
  @ApiPropertyOptional({ description: 'Номер сторінки', example: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Кількість елементів', example: '10' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Пошук за заголовком/текстом' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BroadcastSeverity, description: 'Фільтр за рівнем загрози' })
  @IsEnum(BroadcastSeverity)
  @IsOptional()
  severity?: BroadcastSeverity;
}