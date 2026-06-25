import { Module } from '@nestjs/common';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';

@Module({
  providers: [PollsService],
  controllers: [PollsController]
})
export class PollsModule {}
