import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePollVisibilityDto {
  @ApiProperty({ 
    description: 'Number of days to extend visibility of an archived poll. Pass 0 to hide it immediately from users.', 
    example: 14 
  })
  @IsInt()
  @Min(0)
  extendDays!: number;
}