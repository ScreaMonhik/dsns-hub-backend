import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VoteType } from '@prisma/client';

export class VoteProjectDto {
  @ApiProperty({ description: 'Тип голосу', enum: VoteType, example: VoteType.UPVOTE })
  @IsEnum(VoteType)
  @IsNotEmpty()
  voteType!: VoteType;
}