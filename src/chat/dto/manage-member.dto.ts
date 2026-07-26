import { IsNotEmpty, IsUUID, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManageMemberDto {
  @ApiProperty({ description: 'Target User ID', format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({ description: 'Assign as group admin' })
  @IsBoolean()
  @IsOptional()
  isAdmin?: boolean;
}

export class UpdateAvatarDto {
  @ApiProperty({ description: 'New avatar URL' })
  @IsNotEmpty()
  @IsOptional()
  avatarUrl?: string;
}

export class PinChatDto {
  @ApiProperty({ description: 'Pin status' })
  @IsBoolean()
  @IsNotEmpty()
  isPinned!: boolean;
}

export class ReorderPinnedChatsDto {
  @ApiProperty({ description: 'Array of Chat Group IDs in the new pinned sequence' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  groupIds!: string[];
}

export class UpdateMemberRoleDto {
  @ApiProperty({ description: 'Grant or revoke group admin rights', example: true })
  @IsBoolean()
  @IsNotEmpty()
  isAdmin!: boolean;
}