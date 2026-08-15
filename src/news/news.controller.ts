import { 
  Controller, Get, Post, Patch, Delete, Body, Param, 
  UseGuards, Req, Query, ParseIntPipe, DefaultValuePipe, 
  UseInterceptors, UploadedFile, BadRequestException, 
  NotFoundException, Res, StreamableFile 
} from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateNewsCommentDto } from './dto/create-news-comment.dto';
import { VoteNewsDto } from './dto/vote-news.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, NewsStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { StorageService } from '../storage/storage.service';
import { FileSecurityService } from '../security/file-security.service';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly fileSecurityService: FileSecurityService,
    private readonly storageService: StorageService,
  ) {}

  @ApiOperation({ summary: 'Створити статтю новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post()
  create(@Req() req: RequestWithUser, @Body() createNewsDto: CreateNewsDto) {
    return this.newsService.create(req.user.sub, createNewsDto);
  }

  @ApiOperation({ summary: 'Завантажити зображення або відео для новин/редактора (Тільки ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary', description: 'Файл (JPEG/PNG/MP4/WEBM/OGG)' } },
      required: ['file'],
    },
  })
  @Roles(Role.ADMIN)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|mp4|webm|ogg)$/)) {
          return cb(new BadRequestException('Дозволені тільки зображення (JPEG/PNG) або відео (MP4/WEBM/OGG)!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не завантажено');
    
    await this.fileSecurityService.validateMediaSignature(file.buffer);
    const fileKey = await this.storageService.uploadFile(file, 'news');
    
    return { url: `/news/media/${fileKey.split('/').pop()}` };
  }

  @ApiOperation({ summary: 'Отримати медіафайл (з підтримкою Range-запитів для відео)' })
  @Get('media/:filename')
  async getMedia(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (filename.includes('..') || filename.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }

    const fileKey = `news/${filename}`;
    const range = req.headers.range;

    try {
      if (range) {
        // Отримуємо попередній потік для визначення загального розміру через head або звичайний getStream (або робимо запит заголовків)
        // Для спрощення та оптимізації спершу робимо виклик для отримання метаданих через головний метод
        const headData = await this.storageService.getFileStream(fileKey);
        const fileSize = headData.contentLength;
        headData.stream.destroy(); // закриваємо непотрібний потік

        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
          return;
        }

        const { stream, contentType, contentLength } = await this.storageService.getFileRangeStream(fileKey, start, end);

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength,
          'Content-Type': contentType,
        });
        stream.pipe(res);
      } else {
        const { stream, contentType, contentLength } = await this.storageService.getFileStream(fileKey);

        res.writeHead(200, {
          'Content-Length': contentLength,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });
        stream.pipe(res);
      }
    } catch (error) {
      throw new NotFoundException('Файл не знайдено');
    }
  }

  @ApiOperation({ summary: 'Отримати стрічку новин з пагінацією та фільтрами' })
  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: NewsStatus,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.newsService.findAll(
      req.user,
      page,
      limit,
      categoryId,
      status,
      sortBy,
      sortOrder,
      departmentId,
    );
  }

  @ApiOperation({ summary: 'Отримати всі категорії новин' })
  @UseInterceptors(CacheInterceptor)
  @CacheKey('news_categories')
  @CacheTTL(3600000) // Кешуємо на 1 годину (у мілісекундах)
  @Get('categories')
  findAllCategories() {
    return this.newsService.findAllCategories();
  }

  @ApiOperation({ summary: 'Створити нову категорію новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.newsService.createCategory(dto);
  }

  @ApiOperation({ summary: 'Оновити порядок категорій новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch('categories/reorder')
  reorderCategories(@Body() dto: ReorderCategoriesDto) { // Не забудьте імпортувати ReorderCategoriesDto
    return this.newsService.reorderCategories(dto.categoryIds);
  }

  @ApiOperation({ summary: 'Редагувати назву категорії новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.newsService.updateCategory(id, dto);
  }

  @ApiOperation({ summary: 'Видалити категорію новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.newsService.removeCategory(id);
  }

  @ApiOperation({ summary: 'Отримати деталі однієї новини з коментарями' })
  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.newsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Редагувати новину (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNewsDto, @Req() req: RequestWithUser) {
    return this.newsService.update(id, dto, req.user.sub);
  }

  @ApiOperation({ summary: 'Видалити новину (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.newsService.remove(id, req.user.sub);
  }

  @ApiOperation({ summary: 'Додати коментар до новини' })
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateNewsCommentDto,
  ) {
    return this.newsService.addComment(id, req.user.sub, dto.content, req.user);
  }

  @ApiOperation({ summary: 'Отримати всі коментарі до новини' })
  @Get(':id/comments')
  findComments(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.newsService.findComments(id, req.user);
  }

  @ApiOperation({ summary: 'Видалити коментар адміністратором (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':newsId/comments/:commentId')
  removeComment(
    @Param('newsId') newsId: string,
    @Param('commentId') commentId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.newsService.removeComment(newsId, commentId, req.user.sub);
  }

  @ApiOperation({ summary: 'Проголосувати за новину (Лайк / Дизлайк)' })
  @ApiBody({ type: VoteNewsDto })
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: VoteNewsDto,
  ) {
    return this.newsService.vote(id, req.user.sub, dto.voteType, req.user);
  }
}