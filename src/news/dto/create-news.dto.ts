import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { NewsStatus } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';

export class CreateNewsDto {
  @ApiProperty({ description: 'Назва новини', example: 'Термінове оголошення ГУ' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'HTML-строка контенту новини (автоматично санітизується)', example: '<p>Текст новини...</p>' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? sanitizeHtml(value, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'span', 'u', 's']),
    allowedAttributes: {
      '*': ['style', 'class'],
      'a': ['href', 'name', 'target'],
      'img': ['src', 'alt']
    }
  }) : value)
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

  @ApiPropertyOptional({ description: 'Масив ID підрозділів', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  departmentIds?: string[];
}