import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { CreateProjectCommentDto } from './dto/create-project-comment.dto';
import { VoteProjectDto } from './dto/vote-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, createReadStream, mkdirSync } from 'fs';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

const uploadDir = join(process.cwd(), 'uploads', 'projects');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ApiOperation({ summary: 'Створити новий проєкт/ініціативу з PDF файлом (Тільки ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Назва проєкту' },
        description: { type: 'string', description: 'Опис проєкту' },
        status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], description: 'Статус (за замовчуванням DRAFT)' },
        departmentIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Масив ID підрозділів' },
        file: { type: 'string', format: 'binary', description: 'PDF файл проєкту' },
      },
      required: ['title', 'description', 'file'],
    },
  })
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => {
          const uniqueSuffix = randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files are allowed'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateProjectDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    const fileUrl = `/projects/download/${file.filename}`;
    return this.projectsService.create(req.user.sub, dto, fileUrl);
  }

  @ApiOperation({ summary: 'Завантажити/переглянути PDF файл проєкту за іменем файлу' })
  @Get('download/:filename')
  downloadFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    if (filename.includes('..') || filename.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }

    const filePath = join(uploadDir, filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Файл не знайдено на сервері');
    }

    const fileStream = createReadStream(filePath);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });

    return new StreamableFile(fileStream);
  }

  @ApiOperation({ summary: 'Отримати список проєктів з пагінацією та фільтрацією' })
  @Get()
  findAll(@Req() req: RequestWithUser, @Query() query: QueryProjectDto) {
    return this.projectsService.findAll(req.user, query);
  }

  @ApiOperation({ summary: 'Отримати деталі проєкту разом з коментарями та голосами' })
  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.projectsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Редагувати проєкт (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Req() req: RequestWithUser) {
    return this.projectsService.update(id, dto, req.user.sub);
  }

  @ApiOperation({ summary: 'Опублікувати проєкт (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.projectsService.publish(id);
  }

  @ApiOperation({ summary: 'Перемістити проєкт в архів (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.projectsService.archive(id);
  }

  @ApiOperation({ summary: 'Дістати проєкт з архіву -> отримує статус DRAFT (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string) {
    return this.projectsService.unarchive(id);
  }

  @ApiOperation({ summary: 'Видалити проєкт (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.projectsService.remove(id, req.user.sub);
  }

  @ApiOperation({ summary: 'Видалити коментар проєкту (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':projectId/comments/:commentId')
  removeComment(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.projectsService.removeComment(projectId, commentId, req.user.sub);
  }

  @ApiOperation({ summary: 'Додати коментар до проєкту' })
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateProjectCommentDto,
  ) {
    return this.projectsService.addComment(id, req.user.sub, dto.content, req.user);
  }

  @ApiOperation({ summary: 'Проголосувати за проєкт (UPVOTE / DOWNVOTE)' })
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: VoteProjectDto,
  ) {
    return this.projectsService.vote(id, req.user.sub, dto.voteType, req.user);
  }

  @ApiOperation({ summary: 'Замінити PDF файл проєкту (Тільки ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Новий PDF файл' },
      },
      required: ['file'],
    },
  })
  @Roles(Role.ADMIN)
  @Patch(':id/file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => {
          const uniqueSuffix = randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files are allowed'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  updateFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    const fileUrl = `/projects/download/${file.filename}`;
    return this.projectsService.updateFile(id, fileUrl);
  }
}