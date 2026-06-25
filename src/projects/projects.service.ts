import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { VoteType } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        title: dto.title,
        description: dto.description,
        authorId,
      },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        _count: { select: { comments: true, votes: true } },
      },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        votes: true,
      },
    });

    if (!project) throw new NotFoundException('Проєкт не знайдено');

    // Рахуємо голоси: UPVOTE та DOWNVOTE
    const upvotes = project.votes.filter(v => v.voteType === VoteType.UPVOTE).length;
    const downvotes = project.votes.filter(v => v.voteType === VoteType.DOWNVOTE).length;

    return { ...project, upvotes, downvotes };
  }

  async addComment(projectId: string, authorId: string, content: string) {
    await this.findOne(projectId); // Перевірка існування
    return this.prisma.projectComment.create({
      data: { content, authorId, projectId },
    });
  }

  async vote(projectId: string, userId: string, voteType: VoteType) {
    await this.findOne(projectId); // Перевірка існування

    const existingVote = await this.prisma.projectVote.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // Якщо користувач натиснув ту саму кнопку - забираємо голос
        await this.prisma.projectVote.delete({
          where: { userId_projectId: { userId, projectId } },
        });
        return { message: 'Голос видалено' };
      } else {
        // Якщо користувач змінив голос (наприклад з UPVOTE на DOWNVOTE)
        await this.prisma.projectVote.update({
          where: { userId_projectId: { userId, projectId } },
          data: { voteType },
        });
        return { message: 'Голос змінено' };
      }
    }

    // Якщо голосу не було
    await this.prisma.projectVote.create({
      data: { projectId, userId, voteType },
    });
    return { message: 'Голос зараховано' };
  }
}