import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsStatus } from '@prisma/client';

export class CreateNewsDto {
  @ApiProperty({ description: 'Назва новини', example: 'Термінове оголошення ГУ' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'HTML-строка контенту новини', example: '<p>Текст новини...</p>' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ description: 'URL головного зображення', example: '/news/media/file.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ enum: NewsStatus, default: NewsStatus.PUBLISHED })
  @IsEnum(NewsStatus)
  @IsOptional()
  status?: NewsStatus;

  @ApiPropertyOptional({ description: 'ID категорії', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'ID підрозділу', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;
}