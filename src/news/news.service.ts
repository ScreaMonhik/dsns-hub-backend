import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { VoteType } from '@prisma/client';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateNewsDto) {
    return this.prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content,
        imageUrl: dto.imageUrl,
        authorId,
      },
    });
  }

  async findAll(skip: number = 0, take: number = 10) {
    const articles = await this.prisma.news.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        votes: { select: { voteType: true } },
        _count: { select: { comments: true } },
      },
    });

    return articles.map((article) => {
      const upvotes = article.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
      const downvotes = article.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
      const { votes, ...rest } = article;
      return { ...rest, upvotes, downvotes };
    });
  }

  async findOne(id: string) {
    const news = await this.prisma.news.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        votes: true,
      },
    });

    if (!news) {
      throw new NotFoundException('Новину не знайдено');
    }

    const upvotes = news.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
    const downvotes = news.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
    const commentsCount = news.comments.length;

    return { ...news, upvotes, downvotes, _count: { comments: commentsCount } };
  }

  async addComment(newsId: string, authorId: string, content: string) {
    await this.findOne(newsId);

    return this.prisma.newsComment.create({
      data: { content, authorId, newsId },
    });
  }

  async vote(newsId: string, userId: string, voteType: VoteType) {
    await this.findOne(newsId);

    const existingVote = await this.prisma.newsVote.findUnique({
      where: { userId_newsId: { userId, newsId } },
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        await this.prisma.newsVote.delete({
          where: { userId_newsId: { userId, newsId } },
        });
        return { message: 'Голос видалено' };
      } else {
        await this.prisma.newsVote.update({
          where: { userId_newsId: { userId, newsId } },
          data: { voteType },
        });
        return { message: 'Голос змінено' };
      }
    }

    await this.prisma.newsVote.create({
      data: { userId, newsId, voteType },
    });
    return { message: 'Голос зараховано' };
  }
}