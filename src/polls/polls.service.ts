import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';
import { PollStatus, Prisma, Role } from '@prisma/client';

@Injectable()
export class PollsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreatePollDto) {
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException('Час завершення (expiresAt) має бути у майбутньому часі.');
    }

    if (dto.departmentIds && dto.departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds } },
      });

      if (departments.length !== dto.departmentIds.length) {
        throw new BadRequestException('Один або декілька вказаних підрозділів не знайдено в базі даних');
      }
    }

    return this.prisma.poll.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        authorId,
        departments: dto.departmentIds?.length
          ? { connect: dto.departmentIds.map((id) => ({ id })) }
          : undefined,
        options: {
          create: dto.options.map((text, index) => ({ text, orderIndex: index })),
        },
      },
      include: {
        departments: true,
        options: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  async findAll(
    user: { sub: string; role: Role },
    departmentId?: string,
    status?: PollStatus,
    sortBy?: 'createdAt' | 'votes' | 'author',
    sortOrder: 'asc' | 'desc' = 'desc',
    page?: string | number,
    limit?: string | number,
  ) {
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || 10);

    const andConditions: Prisma.PollWhereInput[] = [];

    if (departmentId) {
      andConditions.push({
        OR: [
          { departments: { some: { id: departmentId } } },
          { departments: { none: {} } },
        ],
      });
    }

    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      if (status) {
        andConditions.push({ status });
      } else {
        andConditions.push({ status: { not: PollStatus.ARCHIVED } });
      }
    } else {
      andConditions.push({
        OR: [
          { status: PollStatus.PUBLISHED },
          {
            status: PollStatus.ARCHIVED,
            archivedVisibleUntil: { gt: new Date() },
          },
        ],
      });
    }

    const whereClause: Prisma.PollWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const polls = await this.prisma.poll.findMany({
      where: whereClause,
      orderBy: sortBy === 'createdAt' ? { createdAt: sortOrder } : { createdAt: 'desc' },
      include: {
        departments: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        options: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: { select: { votes: true } },
            votes: {
              where: { userId: user.sub },
              select: { optionId: true },
            },
          },
        },
      },
    });

    const pollsWithTotal = polls.map((poll) => {
      const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
      
      let userVotedOptionId: string | null = null;
      for (const opt of poll.options) {
        if (opt.votes && opt.votes.length > 0) {
          userVotedOptionId = opt.id;
          break;
        }
      }

      const optionsCleaned = poll.options.map(({ votes, ...optRest }) => optRest);

      return { 
        ...poll, 
        options: optionsCleaned, 
        totalVotes, 
        userVotedOptionId 
      };
    });

    if (sortBy === 'votes') {
      pollsWithTotal.sort((a, b) => {
        return sortOrder === 'asc' ? a.totalVotes - b.totalVotes : b.totalVotes - a.totalVotes;
      });
    } else if (sortBy === 'author') {
      pollsWithTotal.sort((a, b) => {
        const nameA = a.author ? `${a.author.lastName} ${a.author.firstName}`.toLowerCase() : '';
        const nameB = b.author ? `${b.author.lastName} ${b.author.firstName}`.toLowerCase() : '';
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
    }

    const total = pollsWithTotal.length;
    const lastPage = Math.ceil(total / limitNumber);
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedData = pollsWithTotal.slice(startIndex, startIndex + limitNumber);

    return {
      data: paginatedData,
      meta: {
        total,
        page: pageNumber,
        lastPage,
        limit: limitNumber,
      },
    };
  }

  async findOne(id: string, user?: { sub: string; role: Role }) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        departments: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        options: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: { select: { votes: true } },
            votes: {
              where: { userId: user?.sub },
              select: { optionId: true },
            },
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Опитування не знайдено');
    }

    if (user && user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      const isPublished = poll.status === PollStatus.PUBLISHED;
      const isArchivedAndVisible =
        poll.status === PollStatus.ARCHIVED &&
        poll.archivedVisibleUntil &&
        new Date(poll.archivedVisibleUntil) > new Date();

      if (!isPublished && !isArchivedAndVisible) {
        throw new ForbiddenException('Access denied to unpublished or hidden archived poll');
      }
    }

    const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
    
    let userVotedOptionId: string | null = null;
    for (const opt of poll.options) {
      if (opt.votes && opt.votes.length > 0) {
        userVotedOptionId = opt.id;
        break;
      }
    }

    const optionsCleaned = poll.options.map(({ votes, ...optRest }) => optRest);

    return { 
      ...poll, 
      options: optionsCleaned, 
      totalVotes, 
      userVotedOptionId 
    };
  }

  async vote(pollId: string, user: { sub: string; role: Role }, optionId: string) {
    const userId = user.sub;
    const option = await this.prisma.pollOption.findFirst({
      where: { id: optionId, pollId },
      include: { poll: true },
    });

    if (!option) {
      throw new BadRequestException('Некоректний варіант відповіді для цього опитування');
    }

    if (option.poll.status === PollStatus.DRAFT) {
      throw new BadRequestException('Неможливо проголосувати в опитуванні, яке знаходиться в статусі чернетки (DRAFT).');
    }

    if (option.poll.expiresAt && new Date() > option.poll.expiresAt) {
      throw new BadRequestException('Час голосування вичерпано.');
    }

    const existingVote = await this.prisma.pollVote.findFirst({
      where: {
        userId,
        option: { pollId },
      },
    });

    if (existingVote) {
      if (existingVote.optionId === optionId) {
        await this.prisma.pollVote.delete({
          where: { userId_optionId: { userId, optionId: existingVote.optionId } },
        });
        return this.findOne(pollId, user);
      } else {
        await this.prisma.pollVote.delete({
          where: { userId_optionId: { userId, optionId: existingVote.optionId } },
        });
        await this.prisma.pollVote.create({
          data: { userId, optionId },
        });
        return this.findOne(pollId, user);
      }
    }

    await this.prisma.pollVote.create({
      data: { userId, optionId },
    });

    return this.findOne(pollId, user);
  }

  async updateVisibility(id: string, extendDays: number) {
    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    
    if (poll.status !== PollStatus.ARCHIVED) {
      throw new BadRequestException('Visibility can only be changed for archived polls');
    }

    let newVisibleDate: Date | null = null;
    if (extendDays > 0) {
      newVisibleDate = new Date();
      newVisibleDate.setDate(newVisibleDate.getDate() + extendDays);
    }

    return this.prisma.poll.update({
      where: { id },
      data: { archivedVisibleUntil: newVisibleDate },
      include: {
        departments: true,
        options: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: { select: { votes: true } },
          },
        },
      },
    });
  }

  async update(id: string, dto: UpdatePollDto) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
    });

    if (!poll) {
      throw new NotFoundException('Опитування не знайдено');
    }

    const { options, departmentIds, expiresAt, ...updateData } = dto;

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      throw new BadRequestException('Час завершення (expiresAt) має бути у майбутньому часі.');
    }

    // If the poll is already PUBLISHED or ARCHIVED, allow changing ONLY its status field
    if (poll.status !== PollStatus.DRAFT) {
      const { status, ...contentFields } = updateData;
      const hasContentUpdates =
        Object.keys(contentFields).length > 0 ||
        options !== undefined ||
        departmentIds !== undefined;

      if (hasContentUpdates) {
        throw new BadRequestException(
          'Редагування контенту (назви, опису, варіантів чи підрозділів) дозволено тільки для опитувань у статусі DRAFT.',
        );
      }

      return this.prisma.poll.update({
        where: { id },
        data: { 
          status, 
          ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null })
        },
        include: {
          departments: true,
          options: {
            orderBy: { orderIndex: 'asc' },
            include: {
              _count: { select: { votes: true } },
            },
          },
        },
      });
    }

    const dataToUpdate: Prisma.PollUpdateInput = { 
      ...updateData,
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    };

    // Оновлюємо масив підрозділів за допомогою 'set', якщо він переданий (навіть якщо порожній)
    if (departmentIds) {
      dataToUpdate.departments = {
        set: departmentIds.map((deptId) => ({ id: deptId })),
      };
    }

    // Якщо прийшли нові варіанти відповідей, виконуємо транзакцію заміни
    if (options) {
      if (options.length < 2) {
        throw new BadRequestException('Опитування повинно містити щонайменше 2 варіанти відповідей.');
      }

      return this.prisma.$transaction(async (tx) => {
        // 1. Спочатку повністю очищуємо старі варіанти цієї чернетки
        await tx.pollOption.deleteMany({
          where: { pollId: id },
        });

        // 2. Оновлюємо дані опитування та створюємо нові варіанти
        return tx.poll.update({
          where: { id },
          data: {
            ...dataToUpdate,
            options: {
              create: options.map((text, index) => ({ text, orderIndex: index })),
            },
          },
          include: {
            departments: true,
            options: {
              orderBy: { orderIndex: 'asc' },
              include: {
                _count: { select: { votes: true } },
              },
            },
          },
        });
      });
    }

    // Якщо міняються тільки текстові поля чи підрозділи без перезапису options
    return this.prisma.poll.update({
      where: { id },
      data: dataToUpdate,
      include: {
        departments: true,
        options: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: { select: { votes: true } },
          },
        },
      },
    });
  }

  async remove(id: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll) {
      throw new NotFoundException('Опитування не знайдено');
    }

    await this.prisma.poll.delete({ where: { id } });
    return { message: 'Опитування успешно видалено' };
  }
}