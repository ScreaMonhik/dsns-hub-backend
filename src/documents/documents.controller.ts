import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Res,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, createReadStream, mkdirSync } from 'fs';
import type { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

const uploadDir = join(process.cwd(), 'uploads', 'documents');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @ApiOperation({ summary: 'Завантажити та створити документ у форматі PDF (Тільки ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Назва документа' },
        description: { type: 'string', description: 'Опис документа' },
        status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], description: 'Статус (за замовчуванням DRAFT)' },
        departmentIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Масив ID підрозділів' },
        file: { type: 'string', format: 'binary', description: 'PDF файл' },
      },
      required: ['title', 'file'],
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
  uploadDocument(
    @Req() req: RequestWithUser,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    const fileUrl = `/documents/download/${file.filename}`;
    return this.documentsService.create(req.user.sub, dto, fileUrl);
  }

  @ApiOperation({ summary: 'Отримати список документів з пагінацією та фільтрацією' })
  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query() query: QueryDocumentDto,
  ) {
    return this.documentsService.findAll(req.user, query);
  }

  @ApiOperation({ summary: 'Завантажити/переглянути файл PDF за іменем файлу' })
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

  @ApiOperation({ summary: 'Отримати деталі одного документа по ID' })
  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.documentsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Редагувати документ (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Опублікувати документ (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.documentsService.publish(id);
  }

  @ApiOperation({ summary: 'Перемістити документ в архів (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.documentsService.archive(id);
  }

  @ApiOperation({ summary: 'Дістати документ з архіва -> надає статус DRAFT (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string) {
    return this.documentsService.unarchive(id);
  }

  @ApiOperation({ summary: 'Видалити документ (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  @ApiOperation({ summary: 'Замінити PDF файл документа (Тільки ADMIN)' })
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

    const fileUrl = `/documents/download/${file.filename}`;
    return this.documentsService.updateFile(id, fileUrl);
  }
}