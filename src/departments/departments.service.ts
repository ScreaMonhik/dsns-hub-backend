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

  async getPublicRegions() {
    const finalList: Array<{
      id: string;
      name: string;
      originalName: string;
      parentId: string | null;
      hasChildren: boolean;
    }> = [];

    // 1. Знаходимо контейнер областей та витягуємо його прямих нащадків
    const guNode = await this.prisma.department.findFirst({
      where: { name: { contains: 'Головні управління', mode: 'insensitive' } },
      select: { id: true }
    });

    if (guNode) {
      const regions = await this.prisma.department.findMany({
        where: { parentId: guNode.id },
        include: { _count: { select: { children: true } } },
      });

      for (const dept of regions) {
        let formattedName = dept.name
          .toLowerCase()
          .replace(/гу дснс україни (у|в) /g, '')
          .replace(/головне управління дснс україни (у|в) /g, '')
          .replace(/м\.\s*києві/g, 'м. Київ')
          .replace(/ій області/g, 'а область')
          .trim();

        if (formattedName.toLowerCase() === 'м. київ') {
          formattedName = 'м. Київ';
        } else {
          formattedName = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
        }

        finalList.push({
          id: dept.id,
          name: formattedName,
          originalName: dept.name,
          parentId: dept.parentId,
          hasChildren: dept._count.children > 0,
        });
      }
    }

    // 2. Знаходимо Апарат ДСНС
    const aparatNode = await this.prisma.department.findFirst({
      where: { name: { contains: 'Апарат', mode: 'insensitive' } },
      include: { _count: { select: { children: true } } },
    });

    if (aparatNode) {
      finalList.push({
        id: aparatNode.id,
        name: 'Апарат ДСНС',
        originalName: aparatNode.name,
        parentId: aparatNode.parentId,
        hasChildren: aparatNode._count.children > 0,
      });
    }

    // 3. Знаходимо Підрозділи центрального підпорядкування (АРФ ЦП)
    const arfNode = await this.prisma.department.findFirst({
      where: { name: { contains: 'АРФ ЦП', mode: 'insensitive' } },
      include: { _count: { select: { children: true } } },
    });

    if (arfNode) {
      finalList.push({
        id: arfNode.id,
        name: 'Підрозділи центрального підпорядкування (АРФ ЦП)',
        originalName: arfNode.name,
        parentId: arfNode.parentId,
        hasChildren: arfNode._count.children > 0,
      });
    }

    // 4. Сортуємо список
    return finalList.sort((a, b) => {
      const isAparatA = a.name.includes('Апарат');
      const isAparatB = b.name.includes('Апарат');
      if (isAparatA && !isAparatB) return -1;
      if (!isAparatA && isAparatB) return 1;

      const isCentralA = a.name.includes('центрального');
      const isCentralB = b.name.includes('центрального');
      if (isCentralA && !isCentralB) return -1;
      if (!isCentralA && isCentralB) return 1;

      return a.name.localeCompare(b.name, 'uk');
    });
  }

  async searchPublicDepartments(regionId: string, search: string, limit: number) {
    if (!regionId || !search || search.trim().length < 2) {
      return { data: [] };
    }

    // 1. Отримуємо всі зв'язки для побудови дерева в пам'яті (дуже швидка операція, бо витягуємо лише ID)
    const allDepartments = await this.prisma.department.findMany({
      select: { id: true, parentId: true },
    });

    const childrenMap = new Map<string, string[]>();
    for (const dept of allDepartments) {
      if (dept.parentId) {
        if (!childrenMap.has(dept.parentId)) {
          childrenMap.set(dept.parentId, []);
        }
        childrenMap.get(dept.parentId)!.push(dept.id);
      }
    }

    // 2. Рекурсивно збираємо ВСІХ нащадків для переданого regionId (на будь-якій глибині вкладеності)
    const descendantIds = new Set<string>();
    descendantIds.add(regionId); // Додаємо саму область, щоб її теж можна було знайти

    const queue: string[] = [regionId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;

      const children = childrenMap.get(currentId) || [];
      for (const childId of children) {
        descendantIds.add(childId);
        queue.push(childId);
      }
    }

    if (descendantIds.size === 0) {
      return { data: [] };
    }

    // 3. Шукаємо в БД виключно серед знайдених нащадків
    const results = await this.prisma.department.findMany({
      where: {
        id: { in: Array.from(descendantIds) },
        name: { contains: search, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
      }
    });

    return { data: results };
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