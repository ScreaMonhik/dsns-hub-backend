import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNewsDto {
  @ApiProperty({ description: 'Title of the news article' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Main content of the news article' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ description: 'Optional image URL' })
  @IsUrl()
  @IsOptional()
  imageUrl?: string;
}