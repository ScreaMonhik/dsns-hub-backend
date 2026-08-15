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
    const exists = await this.prisma.department.findUnique({
      where: { name: dto.name },
    });

    if (exists) {
      throw new ConflictException('Підрозділ з такою назвою вже існує');
    }

    const department = await this.prisma.department.create({
      data: { name: dto.name },
    });

    // Оскільки ми більше не маємо єдиного ключа (через динамічні query параметри), 
    // для надійності скидаємо весь кеш (в реальному продакшені краще використовувати теги, якщо Redis підтримує)

    return department;
  }

  async findAll(query: QueryDepartmentDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.DepartmentWhereInput = {};
    
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber),
        limit: limitNumber,
      },
    };
  }
}