import { Module } from '@nestjs/common';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PollsCronService } from './polls.cron';

@Module({
  providers: [PollsService, PollsCronService],
  controllers: [PollsController]
})
export class PollsModule {}
