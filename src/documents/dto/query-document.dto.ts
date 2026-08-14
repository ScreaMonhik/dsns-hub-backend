import { IsOptional, IsEnum, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';

export class QueryDocumentDto {
  @ApiPropertyOptional({ description: 'Фільтр за ID підрозділу', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Фільтр за статусом', enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiPropertyOptional({ description: 'Пошуковий запит по назві/опису' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Номер сторінки', example: '1' })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Кількість елементів на сторінці', example: '10' })
  @IsOptional()
  limit?: string;
}