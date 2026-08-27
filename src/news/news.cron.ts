import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NewsStatus } from '@prisma/client';

@Injectable()
export class NewsCronService {
  private readonly logger = new Logger(NewsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledNews() {
    try {
      const now = new Date();

      const result = await this.prisma.news.updateMany({
        where: {
          status: NewsStatus.SCHEDULED,
          publishedAt: {
            lte: now,
          },
        },
        data: {
          status: NewsStatus.PUBLISHED,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Автоматично опубліковано ${result.count} запланованих новин.`);
      }
    } catch (error) {
      this.logger.error('Помилка під час автоматичної публікації новин', error);
    }
  }
}