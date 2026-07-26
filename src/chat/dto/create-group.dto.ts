import { IsString, IsNotEmpty, IsArray, IsUUID, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'Name of the chat group', example: 'Оперативний штаб' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Department ID for this chat', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Avatar URL for the chat' })
  @IsUrl()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'List of regular member IDs', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  memberIds?: string[];

  @ApiPropertyOptional({ description: 'List of group admin IDs', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  adminIds?: string[];
}