import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VotePollDto {
  @ApiProperty({ description: 'ID вибраного варіанту', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  optionId!: string;
}