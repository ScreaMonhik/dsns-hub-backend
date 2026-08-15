import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileSecurityService } from '../security/file-security.service';
import { StorageService } from '../storage/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentStatus, Role, Prisma } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileSecurityService: FileSecurityService,
    private readonly storageService: StorageService,
  ) {}

  async create(authorId: string, dto: CreateDocumentDto, file: Express.Multer.File) {
    await this.fileSecurityService.validatePdfSignature(file.buffer);
    const fileKey = await this.storageService.uploadFile(file, 'documents');
    const fileUrl = `/documents/download/${fileKey.split('/').pop()}`;

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
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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

    const filename = document.fileUrl.split('/').pop();
    if (filename) {
      await this.storageService.deleteFile(`documents/${filename}`);
    }

    await this.prisma.document.delete({ where: { id } });
    return { message: 'Document successfully deleted' };
  }

  async updateFile(id: string, file: Express.Multer.File) {
    await this.fileSecurityService.validatePdfSignature(file.buffer);

    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const oldFilename = document.fileUrl.split('/').pop();
    if (oldFilename) {
      await this.storageService.deleteFile(`documents/${oldFilename}`);
    }

    const newFileKey = await this.storageService.uploadFile(file, 'documents');
    const newFileUrl = `/documents/download/${newFileKey.split('/').pop()}`;

    return this.prisma.document.update({
      where: { id },
      data: { fileUrl: newFileUrl },
      include: {
        departments: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }
}