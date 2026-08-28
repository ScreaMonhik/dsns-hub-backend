import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditLogDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      where.action = query.action;
    }

    if (query.resource) {
      where.resource = query.resource;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          resource: true,
          details: true,
          ipAddress: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber) || 1,
        limit: limitNumber,
      },
    };
  }
}