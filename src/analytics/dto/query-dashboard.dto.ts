import { IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDashboardDto {
  @ApiPropertyOptional({ description: 'Початок періоду (ISO)', example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Кінець періоду (ISO)', example: '2026-08-23T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}