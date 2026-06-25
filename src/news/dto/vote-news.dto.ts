import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VoteType } from '@prisma/client';

export class VoteNewsDto {
  @ApiProperty({ description: 'Тип голосу (лайк або дизлайк)', enum: VoteType, example: VoteType.UPVOTE })
  @IsEnum(VoteType)
  @IsNotEmpty()
  voteType!: VoteType;
}