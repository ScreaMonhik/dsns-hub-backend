import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileSecurityService } from '../security/file-security.service';
import { StorageService } from '../storage/storage.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { VoteType, ProjectStatus, Role, Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileSecurityService: FileSecurityService,
    private readonly storageService: StorageService,
  ) {}

  async create(authorId: string, dto: CreateProjectDto, file: Express.Multer.File) {
    await this.fileSecurityService.validatePdfSignature(file.buffer);
    const fileKey = await this.storageService.uploadFile(file, 'projects');
    const fileUrl = `/projects/download/${fileKey.split('/').pop()}`;

    if (dto.departmentIds && dto.departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds } },
      });

      if (departments.length !== dto.departmentIds.length) {
        throw new BadRequestException('One or more department IDs do not exist');
      }
    }

    return this.prisma.project.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl,
        status: dto.status ?? ProjectStatus.DRAFT,
        authorId,
        departments: dto.departmentIds?.length
          ? { connect: dto.departmentIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        departments: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(user: { sub: string; role: Role }, query: QueryProjectDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.ProjectWhereInput = {};

    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      if (query.status) {
        where.status = query.status;
      }
    } else {
      where.status = ProjectStatus.PUBLISHED;
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

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          departments: { select: { id: true, name: true } },
          votes: { 
            where: { userId: user.sub },
            select: { voteType: true } 
          },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    const mappedData = projects.map((project) => {
      const { votes, upvotesCount, downvotesCount, ...rest } = project;
      const currentUserVote = votes.length > 0 ? votes[0].voteType : null;

      return {
        ...rest,
        upvotes: upvotesCount,
        downvotes: downvotesCount,
        currentUserVote,
      };
    });

    return {
      data: mappedData,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber),
        limit: limitNumber,
      },
    };
  }

  async findOne(id: string, user: { sub: string; role: Role }) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        departments: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        votes: {
          where: { userId: user.sub },
          select: { voteType: true }
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN && project.status !== ProjectStatus.PUBLISHED) {
      throw new ForbiddenException('Access denied to unpublished or archived project');
    }

    const { votes, upvotesCount, downvotesCount, ...rest } = project;
    const currentUserVote = votes.length > 0 ? votes[0].voteType : null;

    return { 
      ...rest, 
      upvotes: upvotesCount, 
      downvotes: downvotesCount, 
      currentUserVote 
    };
  }

  async update(id: string, dto: UpdateProjectDto, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    const { departmentIds, ...restData } = dto;

    if (departmentIds && departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: departmentIds } },
      });

      if (departments.length !== departmentIds.length) {
        throw new BadRequestException('One or more department IDs do not exist');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'Project',
          entityId: id,
          action: 'UPDATE',
          oldValues: project as unknown as Prisma.InputJsonValue,
          newValues: dto as unknown as Prisma.InputJsonValue,
          userId,
        },
      });

      return tx.project.update({
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
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          departments: { select: { id: true, name: true } },
        },
      });
    });
  }

  async publish(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.PUBLISHED },
    });
  }

  async archive(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ARCHIVED },
    });
  }

  async unarchive(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    if (project.status !== ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Project is not in archived status');
    }

    return this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.DRAFT },
    });
  }

  async remove(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    const filename = project.fileUrl.split('/').pop();
    if (filename) {
      await this.storageService.deleteFile(`projects/${filename}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'Project',
          entityId: id,
          action: 'DELETE',
          oldValues: project as unknown as Prisma.InputJsonValue,
          userId,
        },
      });
      await tx.project.delete({ where: { id } });
    });

    return { message: 'Project successfully deleted' };
  }

  async removeComment(projectId: string, commentId: string, userId: string) {
    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found or does not belong to this project');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          entityName: 'ProjectComment',
          entityId: commentId,
          action: 'DELETE',
          oldValues: comment as unknown as Prisma.InputJsonValue,
          userId,
        },
      });
      await tx.projectComment.delete({
        where: { id: commentId },
      });
    });

    return { message: 'Comment successfully deleted' };
  }

  async updateFile(id: string, file: Express.Multer.File) {
    await this.fileSecurityService.validatePdfSignature(file.buffer);

    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const oldFilename = project.fileUrl.split('/').pop();
    if (oldFilename) {
      await this.storageService.deleteFile(`projects/${oldFilename}`);
    }

    const newFileKey = await this.storageService.uploadFile(file, 'projects');
    const newFileUrl = `/projects/download/${newFileKey.split('/').pop()}`;

    return this.prisma.project.update({
      where: { id },
      data: { fileUrl: newFileUrl },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        departments: { select: { id: true, name: true } },
      },
    });
  }

  async addComment(projectId: string, authorId: string, content: string, user: { sub: string; role: Role }) {
    await this.findOne(projectId, user);
    return this.prisma.projectComment.create({
      data: { content, authorId, projectId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  async vote(projectId: string, userId: string, voteType: VoteType, user: { sub: string; role: Role }) {
    await this.findOne(projectId, user);

    return this.prisma.$transaction(async (tx) => {
      const existingVote = await tx.projectVote.findUnique({
        where: { userId_projectId: { userId, projectId } },
      });

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          await tx.projectVote.delete({ where: { userId_projectId: { userId, projectId } } });
          await tx.project.update({
            where: { id: projectId },
            data: {
              ...(voteType === VoteType.UPVOTE ? { upvotesCount: { decrement: 1 } } : { downvotesCount: { decrement: 1 } }),
            },
          });
          return { message: 'Голос видалено' };
        } else {
          await tx.projectVote.update({
            where: { userId_projectId: { userId, projectId } },
            data: { voteType },
          });
          await tx.project.update({
            where: { id: projectId },
            data: {
              ...(voteType === VoteType.UPVOTE 
                ? { upvotesCount: { increment: 1 }, downvotesCount: { decrement: 1 } } 
                : { upvotesCount: { decrement: 1 }, downvotesCount: { increment: 1 } }),
            },
          });
          return { message: 'Голос змінено' };
        }
      }

      await tx.projectVote.create({ data: { projectId, userId, voteType } });
      await tx.project.update({
        where: { id: projectId },
        data: {
          ...(voteType === VoteType.UPVOTE ? { upvotesCount: { increment: 1 } } : { downvotesCount: { increment: 1 } }),
        },
      });
      return { message: 'Голос зараховано' };
    });
  }
}