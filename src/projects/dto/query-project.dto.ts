import { IsOptional, IsEnum, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';

export class QueryProjectDto {
  @ApiPropertyOptional({ description: 'Фільтр за ID підрозділу', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Фільтр за статусом', enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

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