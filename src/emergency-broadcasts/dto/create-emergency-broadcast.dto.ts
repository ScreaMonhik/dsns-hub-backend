import { IsString, IsNotEmpty, IsEnum, IsArray, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BroadcastSeverity, BroadcastSound } from '@prisma/client';

export class CreateEmergencyBroadcastDto {
  @ApiProperty({ description: 'Заголовок сповіщення', example: 'Повітряна тривога!' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Текст сповіщення', example: 'Терміново в укриття. Ракетна небезпека.' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ enum: BroadcastSeverity, default: BroadcastSeverity.CRITICAL })
  @IsEnum(BroadcastSeverity)
  severity!: BroadcastSeverity;

  @ApiProperty({ enum: BroadcastSound, default: BroadcastSound.SIREN })
  @IsEnum(BroadcastSound)
  soundPreset!: BroadcastSound;

  @ApiPropertyOptional({ description: 'Масив ID підрозділів. Порожньо = загальнонаціональне', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  departmentIds?: string[];
}