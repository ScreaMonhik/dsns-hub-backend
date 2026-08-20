import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PollStatus } from '@prisma/client';

@Injectable()
export class PollsCronService {
  private readonly logger = new Logger(PollsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredPolls() {
    try {
      const now = new Date();
      const visibleUntil = new Date(now);
      visibleUntil.setMonth(visibleUntil.getMonth() + 1); // Автоматично показуємо 1 місяць після закінчення

      const result = await this.prisma.poll.updateMany({
        where: {
          status: PollStatus.PUBLISHED,
          expiresAt: {
            lt: now,
          },
        },
        data: {
          status: PollStatus.ARCHIVED,
          archivedVisibleUntil: visibleUntil,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Автоматично переведено в архів ${result.count} протермінованих опитувань.`);
      }
    } catch (error) {
      this.logger.error('Помилка під час автоматичного архісування опитувань', error);
    }
  }
}