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
import { StorageService } from '../storage/storage.service';
import type { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
  ) {}

  @ApiOperation({ summary: 'Завантажити та створити документ у форматі PDF (ADMIN, SUPER_ADMIN)' })
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
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

    return this.documentsService.create(req.user.sub, dto, file);
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
  async downloadFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const fileKey = `documents/${filename}`;
    const { stream, contentType, contentLength } = await this.storageService.getFileStream(fileKey);

    res.set({
      'Content-Type': contentType,
      'Content-Length': contentLength.toString(),
      'Content-Disposition': `inline; filename="${filename}"`,
    });

    return new StreamableFile(stream);
  }

  @ApiOperation({ summary: 'Отримати деталі одного документа по ID' })
  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.documentsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Редагувати документ (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Опублікувати документ (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.documentsService.publish(id);
  }

  @ApiOperation({ summary: 'Перемістити документ в архів (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.documentsService.archive(id);
  }

  @ApiOperation({ summary: 'Дістати документ з архіва -> надає статус DRAFT (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string) {
    return this.documentsService.unarchive(id);
  }

  @ApiOperation({ summary: 'Видалити документ (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  @ApiOperation({ summary: 'Замінити PDF файл документа (ADMIN, SUPER_ADMIN)' })
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/file')
  @UseInterceptors(
    FileInterceptor('file', {
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

    return this.documentsService.updateFile(id, file);
  }
}