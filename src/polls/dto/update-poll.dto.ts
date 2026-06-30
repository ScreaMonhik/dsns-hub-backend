import { PartialType } from '@nestjs/swagger';
import { CreatePollDto } from './create-poll.dto';

export class UpdatePollDto extends PartialType(CreatePollDto) {
    @ApiPropertyOptional({ description: 'Час завершення опитування', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt має бути коректною датою у форматі ISO 8601' })
  expiresAt?: string;
}