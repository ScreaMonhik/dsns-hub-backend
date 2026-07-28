import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { VoteType, NewsStatus, Prisma } from '@prisma/client';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateNewsDto) {
    return this.prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content,
        imageUrl: dto.imageUrl,
        status: dto.status,
        categoryId: dto.categoryId,
        departmentId: dto.departmentId,
        authorId,
      },
    });
  }

  async findAll(
    page: number,
    limit: number,
    categoryId?: string,
    status?: NewsStatus,
    sortBy?: string,
    sortOrder?: string,
    departmentId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.NewsWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (departmentId) where.departmentId = departmentId;
    
    // Враховуємо логіку архівації з попереднього кроку
    if (status) {
      where.status = status;
    } else {
      where.status = { not: NewsStatus.ARCHIVED };
    }

    // Validate allowed sort fields including relation statistics
    const validSortFields = [
      'id', 'title', 'content', 'imageUrl', 'status', 
      'categoryId', 'createdAt', 'authorId', 'comments', 'likes', 'dislikes'
    ];
    const finalSortBy = sortBy && validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    // Validate sorting direction
    let finalSortOrder: 'asc' | 'desc' = 'desc';
    if (sortOrder) {
      const normalizedOrder = sortOrder.toLowerCase();
      if (normalizedOrder === 'asc' || normalizedOrder === 'desc') {
        finalSortOrder = normalizedOrder;
      }
    }

    let orderBy: Prisma.NewsOrderByWithRelationInput;

    // Map strategic stats keys to proper Prisma relation count sorting syntax
    if (finalSortBy === 'comments') {
      orderBy = { comments: { _count: finalSortOrder } };
    } else if (finalSortBy === 'likes' || finalSortBy === 'dislikes') {
      // Since UPVOTEs and DOWNVOTEs are stored in a single NewsVote table,
      // Prisma's native relational _count sorts by total vote volume at the DB level.
      orderBy = { votes: { _count: finalSortOrder } };
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
          department: { select: { id: true, name: true } },
          votes: { select: { voteType: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.news.count({ where }),
    ]);

    const mappedData = articles.map((article) => {
      const upvotes = article.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
      const downvotes = article.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
      const { votes, ...rest } = article;
      return { 
        ...rest, 
        _count: {
          comments: article._count.comments,
          likes: upvotes,
          dislikes: downvotes,
        }
      };
    });

    return {
      data: mappedData,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
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
        votes: true,
      },
    });

    if (!news) throw new NotFoundException('Новину не знайдено');

    const upvotes = news.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
    const downvotes = news.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
    const commentsCount = news.comments.length;

    return { ...news, upvotes, downvotes, _count: { comments: commentsCount } };
  }

  async update(id: string, dto: UpdateNewsDto) {
    await this.findOne(id);
    return this.prisma.news.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.news.delete({ where: { id } });
    return { message: 'Новину успішно видалено' };
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.newsCategory.create({
      data: { name: dto.name },
    });
  }

  async findAllCategories() {
    return this.prisma.newsCategory.findMany({
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категорію не знайдено');

    return this.prisma.newsCategory.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async removeCategory(id: string) {
    const category = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категорію не знайдено');
    
    await this.prisma.newsCategory.delete({ where: { id } });
    return { message: 'Категорію успішно видалено' };
  }

  async reorderCategories(categoryIds: string[]) {
    // Використовуємо транзакцію для безпечного масового оновлення
    const queries = categoryIds.map((id, index) =>
      this.prisma.newsCategory.update({
        where: { id },
        data: { orderIndex: index },
      }),
    );
    
    await this.prisma.$transaction(queries);
    return { message: 'Порядок категорій оновлено' };
  }

  async addComment(newsId: string, authorId: string, content: string) {
    await this.findOne(newsId);

    return this.prisma.newsComment.create({
      data: { content, authorId, newsId },
    });
  }

  async findComments(newsId: string) {
    await this.findOne(newsId);

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

  async removeComment(newsId: string, commentId: string) {
    const comment = await this.prisma.newsComment.findFirst({
      where: { id: commentId, newsId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found or does not belong to this news');
    }

    await this.prisma.newsComment.delete({
      where: { id: commentId },
    });

    return { message: 'Comment successfully deleted' };
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