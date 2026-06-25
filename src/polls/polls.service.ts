import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto } from './dto/create-poll.dto';

@Injectable()
export class PollsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePollDto) {
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });

    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    // Використовуємо вкладені запити (Nested Writes) Prisma для одночасного створення опитування та його варіантів
    return this.prisma.poll.create({
      data: {
        title: dto.title,
        departmentId: dto.departmentId,
        options: {
          create: dto.options.map((text) => ({ text })),
        },
      },
      include: {
        options: true,
      },
    });
  }

  async findAll(departmentId?: string) {
    const polls = await this.prisma.poll.findMany({
      where: departmentId ? { departmentId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        department: true,
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
      },
    });

    return polls.map((poll) => {
      const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
      return { ...poll, totalVotes };
    });
  }

  async findOne(id: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        department: true,
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Опитування не знайдено');
    }

    const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
    return { ...poll, totalVotes };
  }

  async vote(pollId: string, userId: string, optionId: string) {
    // 1. Перевіряємо чи існує опція і чи належить вона саме цьому опитуванню
    const option = await this.prisma.pollOption.findFirst({
      where: { id: optionId, pollId },
    });

    if (!option) {
      throw new BadRequestException('Некоректний варіант відповіді для цього опитування');
    }

    // 2. Шукаємо, чи голосував вже цей користувач у ЦЬОМУ опитуванні (за будь-яку опцію)
    const existingVote = await this.prisma.pollVote.findFirst({
      where: {
        userId,
        option: { pollId },
      },
    });

    if (existingVote) {
      if (existingVote.optionId === optionId) {
        // Знімаємо голос, якщо користувач натиснув на той самий варіант
        await this.prisma.pollVote.delete({
          where: { userId_optionId: { userId, optionId: existingVote.optionId } },
        });
        return { message: 'Голос знято' };
      } else {
        // Змінюємо голос
        await this.prisma.pollVote.delete({
          where: { userId_optionId: { userId, optionId: existingVote.optionId } },
        });
        await this.prisma.pollVote.create({
          data: { userId, optionId },
        });
        return { message: 'Голос змінено' };
      }
    }

    // 3. Якщо голосу не було
    await this.prisma.pollVote.create({
      data: { userId, optionId },
    });

    return { message: 'Голос зараховано' };
  }
}