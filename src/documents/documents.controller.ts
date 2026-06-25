import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  NotFoundException,
  Res,
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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, createReadStream, mkdirSync } from 'fs';
import type { Response } from 'express';

// Автоматично створюємо директорію для файлів при старті модуля
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

  @ApiOperation({ summary: 'Завантажити документ (тільки PDF, до 10MB, ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Назва документа' },
        departmentId: { type: 'string', format: 'uuid', description: 'ID підрозділу' },
        file: { type: 'string', format: 'binary', description: 'PDF файл' },
      },
      required: ['title', 'departmentId', 'file'],
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
    }),
  )
  uploadDocument(
    @Body() dto: CreateDocumentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // Ліміт 10 МБ
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не завантажено');
    }

    const fileUrl = `/documents/download/${file.filename}`;
    return this.documentsService.uploadDocument(dto.title, dto.departmentId, fileUrl);
  }

  @ApiOperation({ summary: 'Отримати список документів (з опціональною фільтрацією по підрозділу)' })
  @Get()
  findAll(@Query('departmentId') departmentId?: string) {
    return this.documentsService.findAll(departmentId);
  }

  @ApiOperation({ summary: 'Отримати (завантажити) файл за його ім\'ям' })
  @Get('download/:filename')
  downloadFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
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
}