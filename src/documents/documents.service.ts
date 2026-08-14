import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentStatus, Role, Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateDocumentDto, fileUrl: string) {
    if (dto.departmentIds && dto.departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds } },
      });

      if (departments.length !== dto.departmentIds.length) {
        throw new BadRequestException('One or more department IDs do not exist');
      }
    }

    return this.prisma.document.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl,
        status: dto.status ?? DocumentStatus.DRAFT,
        authorId,
        departments: dto.departmentIds?.length
          ? { connect: dto.departmentIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        departments: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(user: { sub: string; role: Role }, query: QueryDocumentDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.DocumentWhereInput = {};

    if (user.role === Role.USER) {
      where.status = DocumentStatus.PUBLISHED;
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.departmentId) {
      where.OR = [
        { departments: { some: { id: query.departmentId } } },
        { departments: { none: {} } },
      ];
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { createdAt: 'desc' },
        include: {
          departments: { select: { id: true, name: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber),
        limit: limitNumber,
      },
    };
  }

  async findOne(id: string, user: { sub: string; role: Role }) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        departments: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (user.role === Role.USER && document.status !== DocumentStatus.PUBLISHED) {
      throw new ForbiddenException('Access denied to unpublished or archived document');
    }

    return document;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const { departmentIds, ...restData } = dto;

    if (departmentIds && departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: departmentIds } },
      });

      if (departments.length !== departmentIds.length) {
        throw new BadRequestException('One or more department IDs do not exist');
      }
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        ...restData,
        ...(departmentIds !== undefined && {
          departments: {
            set: departmentIds.map((deptId) => ({ id: deptId })),
          },
        }),
      },
      include: {
        departments: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async publish(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.PUBLISHED },
    });
  }

  async archive(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.ARCHIVED },
    });
  }

  async unarchive(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status !== DocumentStatus.ARCHIVED) {
      throw new BadRequestException('Document is not in archived status');
    }

    return this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.DRAFT },
    });
  }

  async remove(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Видаляємо файл з диска
    const filename = document.fileUrl.split('/').pop();
    if (filename) {
      const filePath = join(process.cwd(), 'uploads', 'documents', filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ігноруємо помилку, якщо файл вже відсутній на диску
      }
    }

    await this.prisma.document.delete({ where: { id } });
    return { message: 'Document successfully deleted' };
  }

  async updateFile(id: string, fileUrl: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Видаляємо старий файл з диска перед збереженням нового
    const oldFilename = document.fileUrl.split('/').pop();
    if (oldFilename) {
      const oldFilePath = join(process.cwd(), 'uploads', 'documents', oldFilename);
      try {
        await fs.unlink(oldFilePath);
      } catch (error) {
        // Ігноруємо, якщо старий файл не знайдено
      }
    }

    return this.prisma.document.update({
      where: { id },
      data: { fileUrl },
      include: {
        departments: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}