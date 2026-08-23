import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportFormat {
  PDF = 'pdf',
  CSV = 'csv',
}

export class ExportAnalyticsDto {
  @ApiProperty({ enum: ExportFormat, description: 'Формат файлу (pdf або csv)' })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiPropertyOptional({ description: 'Початок періоду (ISO)', example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Кінець періоду (ISO)', example: '2026-08-23T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}