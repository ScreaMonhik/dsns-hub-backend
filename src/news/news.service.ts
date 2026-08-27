import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { VoteType, NewsStatus, Prisma, Role } from '@prisma/client';

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(authorId: string, dto: CreateNewsDto) {
    return this.prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content,
        imageUrl: dto.imageUrl,
        status: dto.status,
        categoryId: dto.categoryId,
        departments: dto.departmentIds?.length ? {
          connect: dto.departmentIds.map((id) => ({ id }))
        } : undefined,
        authorId,
      },
    });
  }

  async findAll(
    user: { sub: string; role: Role },
    page: number,
    limit: number,
    categoryId?: string,
    status?: NewsStatus,
    sortBy?: string,
    sortOrder?: string,
    departmentId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.NewsWhereInput = {
      ...(categoryId && { categoryId }),
      ...(departmentId && { departments: { some: { id: departmentId } } }),
    };

    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      if (status) {
        where.status = status;
      } else {
        where.status = { not: NewsStatus.ARCHIVED };
      }
    } else {
      where.status = NewsStatus.PUBLISHED;
    }

    const validSortFields = [
      'id', 'title', 'content', 'imageUrl', 'status', 
      'categoryId', 'createdAt', 'authorId', 'comments', 'likes', 'dislikes'
    ];
    const finalSortBy = sortBy && validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    let finalSortOrder: 'asc' | 'desc' = 'desc';
    if (sortOrder) {
      const normalizedOrder = sortOrder.toLowerCase();
      if (normalizedOrder === 'asc' || normalizedOrder === 'desc') {
        finalSortOrder = normalizedOrder;
      }
    }

    let orderBy: Prisma.NewsOrderByWithRelationInput;

    if (finalSortBy === 'comments') {
      orderBy = { comments: { _count: finalSortOrder } };
    } else if (finalSortBy === 'likes') {
      orderBy = { upvotesCount: finalSortOrder };
    } else if (finalSortBy === 'dislikes') {
      orderBy = { downvotesCount: finalSortOrder };
    } else {
      orderBy = { [finalSortBy]: finalSortOrder };
    }

    const [articles, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          category: true,
          departments: { select: { id: true, name: true } },
          votes: { 
            where: { userId: user.sub },
            select: { voteType: true } 
          },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.news.count({ where }),
    ]);

    const mappedData = articles.map((article) => {
      const { votes, upvotesCount, downvotesCount, imageUrl, author, ...rest } = article;
      const currentUserVote = votes.length > 0 ? votes[0].voteType : null;
      
      return { 
        ...rest,
        imageUrl: imageUrl ?? '',
        author: {
          ...author,
          avatarUrl: author.avatarUrl ?? '',
        },
        votes: votes,
        upvotes: upvotesCount,
        downvotes: downvotesCount,
        currentUserVote,
        _count: {
          comments: article._count.comments,
          likes: upvotesCount,
          dislikes: downvotesCount,
        }
      };
    });

    return {
      data: mappedData,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
        limit,
      },
    };
  }

  async findOne(id: string, user?: { sub: string; role: Role }) {
    const news = await this.prisma.news.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        category: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        votes: {
          where: { userId: user?.sub || 'unauthenticated' },
          select: { voteType: true }
        },
      },
    });

    if (!news) throw new NotFoundException('Новину не знайдено');

    if (user && user.role === Role.USER && news.status !== NewsStatus.PUBLISHED) {
      throw new ForbiddenException('Access denied to unpublished or archived news');
    }

    const { votes, upvotesCount, downvotesCount, ...rest } = news;
    const currentUserVote = votes.length > 0 ? votes[0].voteType : null;

    return { 
      ...rest, 
      upvotes: upvotesCount, 
      downvotes: downvotesCount, 
      currentUserVote,
      _count: { comments: news.comments.length } 
    };
  }

  async update(id: string, dto: UpdateNewsDto, userId: string) {
    const oldNews = await this.findOne(id); // Validation check and old data retrieval

    const { departmentIds, ...restData } = dto;

    return this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'News',
          entityId: id,
          action: 'UPDATE',
          oldValues: oldNews as unknown as Prisma.InputJsonValue,
          newValues: dto as unknown as Prisma.InputJsonValue,
          userId,
        },
      });

      return tx.news.update({
        where: { id },
        data: {
          ...restData,
          ...(departmentIds !== undefined && {
            departments: {
              set: departmentIds.map((deptId) => ({ id: deptId })),
            },
          }),
        },
      });
    });
  }

  async remove(id: string, userId: string) {
    const oldNews = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'News',
          entityId: id,
          action: 'DELETE',
          oldValues: oldNews as unknown as Prisma.InputJsonValue,
          userId,
        },
      });
      await tx.news.delete({ where: { id } });
    });

    return { message: 'Новину успішно видалено' };
  }

  async createCategory(dto: CreateCategoryDto) {
    const category = await this.prisma.newsCategory.create({
      data: { name: dto.name },
    });
    await this.cacheManager.del('news_categories');
    return category;
  }

  async findAllCategories() {
    return this.prisma.newsCategory.findMany({
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категорію не знайдено');

    const updatedCategory = await this.prisma.newsCategory.update({
      where: { id },
      data: { name: dto.name },
    });
    
    await this.cacheManager.del('news_categories');
    return updatedCategory;
  }

  async removeCategory(id: string) {
    const category = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категорію не знайдено');
    
    await this.prisma.newsCategory.delete({ where: { id } });
    await this.cacheManager.del('news_categories');
    
    return { message: 'Категорію успішно видалено' };
  }

  async reorderCategories(categoryIds: string[]) {
    const queries = categoryIds.map((id, index) =>
      this.prisma.newsCategory.update({
        where: { id },
        data: { orderIndex: index },
      }),
    );
    
    await this.prisma.$transaction(queries);
    await this.cacheManager.del('news_categories');
    
    return { message: 'Порядок категорій оновлено' };
  }

  async addComment(newsId: string, authorId: string, content: string, user?: { sub: string; role: Role }) {
    await this.findOne(newsId, user);

    return this.prisma.newsComment.create({
      data: { content, authorId, newsId },
    });
  }

  async findComments(newsId: string, user?: { sub: string; role: Role }) {
    await this.findOne(newsId, user);

    return this.prisma.newsComment.findMany({
      where: { newsId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async removeComment(newsId: string, commentId: string, userId: string) {
    const comment = await this.prisma.newsComment.findFirst({
      where: { id: commentId, newsId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found or does not belong to this news');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'NewsComment',
          entityId: commentId,
          action: 'DELETE',
          oldValues: comment as unknown as Prisma.InputJsonValue,
          userId,
        },
      });
      await tx.newsComment.delete({
        where: { id: commentId },
      });
    });

    return { message: 'Comment successfully deleted' };
  }

  async vote(newsId: string, userId: string, voteType: VoteType, user?: { sub: string; role: Role }) {
    await this.findOne(newsId, user);

    return this.prisma.$transaction(async (tx) => {
      const existingVote = await tx.newsVote.findUnique({
        where: { userId_newsId: { userId, newsId } },
      });

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          await tx.newsVote.delete({ where: { userId_newsId: { userId, newsId } } });
          await tx.news.update({
            where: { id: newsId },
            data: {
              ...(voteType === VoteType.UPVOTE ? { upvotesCount: { decrement: 1 } } : { downvotesCount: { decrement: 1 } }),
            },
          });
          return { message: 'Голос видалено' };
        } else {
          await tx.newsVote.update({
            where: { userId_newsId: { userId, newsId } },
            data: { voteType },
          });
          await tx.news.update({
            where: { id: newsId },
            data: {
              ...(voteType === VoteType.UPVOTE 
                ? { upvotesCount: { increment: 1 }, downvotesCount: { decrement: 1 } } 
                : { upvotesCount: { decrement: 1 }, downvotesCount: { increment: 1 } }),
            },
          });
          return { message: 'Голос змінено' };
        }
      }

      await tx.newsVote.create({ data: { userId, newsId, voteType } });
      await tx.news.update({
        where: { id: newsId },
        data: {
          ...(voteType === VoteType.UPVOTE ? { upvotesCount: { increment: 1 } } : { downvotesCount: { increment: 1 } }),
        },
      });
      return { message: 'Голос зараховано' };
    });
  }
}