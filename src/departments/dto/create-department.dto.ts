import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Назва підрозділу', example: 'ГУ ДСНС у Київській області' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'ID батьківського підрозділу', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;
}