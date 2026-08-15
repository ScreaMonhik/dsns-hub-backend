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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, createReadStream } from 'fs';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const newsUploadDir = join(process.cwd(), 'uploads', 'news');
if (!existsSync(newsUploadDir)) {
  mkdirSync(newsUploadDir, { recursive: true });
}

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

import { FileSecurityService } from '../security/file-security.service';

@ApiTags('News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly fileSecurityService: FileSecurityService,
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
      storage: diskStorage({
        destination: newsUploadDir,
        filename: (req, file, cb) => {
          const uniqueSuffix = randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
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
    
    const filePath = join(newsUploadDir, file.filename);
    await this.fileSecurityService.validateMediaSignature(filePath);
    
    return { url: `/news/media/${file.filename}` };
  }

  @ApiOperation({ summary: 'Отримати медіафайл (з підтримкою Range-запитів для відео)' })
  @Get('media/:filename')
  getMedia(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const filePath = join(newsUploadDir, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Файл не знайдено');

    const stat = require('fs').statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    let contentType = 'application/octet-stream';
    if (filename.endsWith('.png')) contentType = 'image/png';
    else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filename.endsWith('.mp4')) contentType = 'video/mp4';
    else if (filename.endsWith('.webm')) contentType = 'video/webm';
    else if (filename.endsWith('.ogg')) contentType = 'video/ogg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(filePath).pipe(res);
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