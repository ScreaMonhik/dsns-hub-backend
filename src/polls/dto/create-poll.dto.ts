import { IsString, IsNotEmpty, IsUUID, IsArray, ArrayMinSize, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PollStatus } from '@prisma/client';

export class CreatePollDto {
  @ApiProperty({ description: 'Тема опитування', example: 'Оптимальний графік чергувань?' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Детальний опис або правила опитування' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Статус публікації', enum: PollStatus, default: PollStatus.PUBLISHED })
  @IsEnum(PollStatus)
  @IsOptional()
  status?: PollStatus;

  @ApiPropertyOptional({ description: 'Масив ID підрозділів (залишіть порожнім для загального опитування)', type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  departmentIds?: string[];

  @ApiProperty({ 
    description: 'Варіанти відповідей (мінімум 2)', 
    type: [String], 
    example: ['Доба через дві', 'Доба через три'] 
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  options!: string[];
}