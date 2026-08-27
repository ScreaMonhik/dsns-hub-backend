import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsCronService } from './news.cron';

@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsCronService]
})
export class NewsModule {}