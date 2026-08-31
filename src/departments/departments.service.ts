import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { DepartmentReorderItemDto } from './dto/reorder-departments.dto';
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

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
      },
    });

    await this.cacheManager.clear();
    return department;
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
        orderBy: [
          { orderIndex: 'asc' },
          { name: 'asc' },
        ],
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

  async findAllTree() {
    const departments = await this.prisma.department.findMany({
      orderBy: [
        { orderIndex: 'asc' },
        { name: 'asc' },
      ],
      include: {
        _count: { select: { children: true } },
      },
    });

    return departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      parentId: dept.parentId,
      orderIndex: dept.orderIndex,
      hasChildren: dept._count.children > 0,
    }));
  }

  async reorder(items: DepartmentReorderItemDto[]) {
    const queries = items.map((item) =>
      this.prisma.department.update({
        where: { id: item.id },
        data: {
          parentId: item.parentId !== undefined ? item.parentId : undefined,
          orderIndex: item.orderIndex,
        },
      }),
    );

    await this.prisma.$transaction(queries);
    await this.cacheManager.clear();

    return { message: 'Порядок підрозділів успішно оновлено' };
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    if (dto.parentId === id) {
      throw new BadRequestException('Підрозділ не може бути підпорядкований самому собі');
    }

    if (dto.name || dto.parentId !== undefined) {
      const nameToCheck = dto.name || department.name;
      const parentToCheck = dto.parentId !== undefined ? dto.parentId : department.parentId;
      
      const exists = await this.prisma.department.findFirst({
        where: {
          name: nameToCheck,
          parentId: parentToCheck,
          id: { not: id }
        },
      });

      if (exists) {
        throw new ConflictException('Підрозділ з такою назвою вже існує у цьому блоці');
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });

    await this.cacheManager.clear();
    return updated;
  }

  async remove(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } }
    });

    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    if (department._count.children > 0) {
      throw new BadRequestException('Не можна видалити підрозділ, який має підпорядковані підрозділи. Спочатку перемістіть або видаліть їх.');
    }

    await this.prisma.department.delete({ where: { id } });
    await this.cacheManager.clear();
    
    return { message: 'Підрозділ успішно видалено' };
  }

  async exportStructureJson() {
    const departments = await this.prisma.department.findMany({
      orderBy: [
        { orderIndex: 'asc' },
        { name: 'asc' },
      ],
    });

    const formattedData = departments.map((dept) => ({
      id: dept.id,
      pid: dept.parentId,
      label: dept.name,
    }));

    return JSON.stringify(formattedData, null, 2);
  }
}