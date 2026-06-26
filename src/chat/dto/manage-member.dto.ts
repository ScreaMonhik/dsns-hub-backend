import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManageMemberDto {
  @ApiProperty({ description: 'ID користувача', format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  userId!: string;
}