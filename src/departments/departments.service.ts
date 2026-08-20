import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(dto: CreateDepartmentDto) {
    const exists = await this.prisma.department.findFirst({
      where: {
        name: dto.name,
        parentId: dto.parentId ?? null,
      },
    });

    if (exists) {
      throw new ConflictException('Підрозділ з такою назвою вже існує у даному блоці');
    }

    return this.prisma.department.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
      },
    });
  }

  async findAll(query: QueryDepartmentDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 100);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.DepartmentWhereInput = {};

    if (query.parentId !== undefined) {
      if (query.parentId === 'null' || query.parentId === '') {
        where.parentId = null;
      } else {
        where.parentId = query.parentId;
      }
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { children: true } },
        },
      }),
      this.prisma.department.count({ where }),
    ]);

    const mappedData = data.map((dept) => ({
      id: dept.id,
      name: dept.name,
      parentId: dept.parentId,
      hasChildren: dept._count.children > 0,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber) || 1,
        limit: limitNumber,
      },
    };
  }
}