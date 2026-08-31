import { IsBoolean, IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BannerSeverity } from '@prisma/client';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Режим технічних робіт' })
  @IsBoolean()
  @IsOptional()
  maintenanceMode?: boolean;

  @ApiPropertyOptional({ description: 'Повідомлення для користувачів під час тех. робіт' })
  @IsString()
  @IsOptional()
  maintenanceMessage?: string;

  @ApiPropertyOptional({ description: 'Чи увімкнений системний банер' })
  @IsBoolean()
  @IsOptional()
  globalBannerEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Текст системного сповіщення' })
  @IsString()
  @IsOptional()
  globalBannerText?: string;

  @ApiPropertyOptional({ enum: BannerSeverity, description: 'Тип сповіщення' })
  @IsEnum(BannerSeverity)
  @IsOptional()
  globalBannerSeverity?: BannerSeverity;

  @ApiPropertyOptional({ description: 'Ліміт для завантаження PDF (МБ)' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxPdfSizeMB?: number;

  @ApiPropertyOptional({ description: 'Ліміт для медіафайлів (МБ)' })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  maxMediaSizeMB?: number;
}