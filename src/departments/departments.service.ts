import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

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

    // Інвалідація кешу після створення нового підрозділу
    await this.cacheManager.del('departments_list');

    return department;
  }

  async findAll() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
  }
}