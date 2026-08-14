import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { VoteType, ProjectStatus, Role, Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateProjectDto, fileUrl: string) {
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

    if (user.role === Role.USER) {
      where.status = ProjectStatus.PUBLISHED;
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

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          departments: { select: { id: true, name: true } },
          votes: { select: { voteType: true, userId: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    const mappedData = projects.map((project) => {
      const upvotes = project.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
      const downvotes = project.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
      const currentUserVote = project.votes.find((v) => v.userId === user.sub)?.voteType || null;

      const { votes, ...rest } = project;

      return {
        ...rest,
        upvotes,
        downvotes,
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
        votes: true,
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (user.role === Role.USER && project.status !== ProjectStatus.PUBLISHED) {
      throw new ForbiddenException('Access denied to unpublished or archived project');
    }

    const upvotes = project.votes.filter((v) => v.voteType === VoteType.UPVOTE).length;
    const downvotes = project.votes.filter((v) => v.voteType === VoteType.DOWNVOTE).length;
    const currentUserVote = project.votes.find((v) => v.userId === user.sub)?.voteType || null;

    return { ...project, upvotes, downvotes, currentUserVote };
  }

  async update(id: string, dto: UpdateProjectDto) {
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

    return this.prisma.project.update({
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

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    // Видаляємо PDF файл з диска при видаленні проєкту
    const filename = project.fileUrl.split('/').pop();
    if (filename) {
      const filePath = join(process.cwd(), 'uploads', 'projects', filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ігноруємо помилку, якщо файл вже відсутній на диску
      }
    }

    await this.prisma.project.delete({ where: { id } });
    return { message: 'Project successfully deleted' };
  }

  async updateFile(id: string, fileUrl: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    // Видаляємо старий файл з диска перед збереженням нового
    const oldFilename = project.fileUrl.split('/').pop();
    if (oldFilename) {
      const oldFilePath = join(process.cwd(), 'uploads', 'projects', oldFilename);
      try {
        await fs.unlink(oldFilePath);
      } catch (error) {
        // Ігноруємо помилку, якщо старий файл відсутній
      }
    }

    return this.prisma.project.update({
      where: { id },
      data: { fileUrl },
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

    const existingVote = await this.prisma.projectVote.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        await this.prisma.projectVote.delete({
          where: { userId_projectId: { userId, projectId } },
        });
        return { message: 'Голос видалено' };
      } else {
        await this.prisma.projectVote.update({
          where: { userId_projectId: { userId, projectId } },
          data: { voteType },
        });
        return { message: 'Голос змінено' };
      }
    }

    await this.prisma.projectVote.create({
      data: { projectId, userId, voteType },
    });
    return { message: 'Голос зараховано' };
  }
}