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

@ApiTags('News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @ApiOperation({ summary: 'Створити статтю новин (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post()
  create(@Req() req: RequestWithUser, @Body() createNewsDto: CreateNewsDto) {
    return this.newsService.create(req.user.sub, createNewsDto);
  }

  @ApiOperation({ summary: 'Завантажити зображення для новин/редактора (Тільки ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary', description: 'Зображення (JPEG/PNG)' } },
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
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(new BadRequestException('Дозволені тільки файли зображень!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не завантажено');
    return { url: `/news/media/${file.filename}` };
  }

  @ApiOperation({ summary: 'Отримати файл зображення за його ім\'ям' })
  @Get('media/:filename')
  getMedia(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    const filePath = join(newsUploadDir, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Файл не знайдено');
    
    res.set({ 'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg' });
    return new StreamableFile(createReadStream(filePath));
  }

  @ApiOperation({ summary: 'Отримати стрічку новин з пагінацією та фільтрами' })
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: NewsStatus,
  ) {
    return this.newsService.findAll(page, limit, categoryId, status);
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
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @ApiOperation({ summary: 'Редагувати новину (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Видалити новину (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }

  @ApiOperation({ summary: 'Додати коментар до новини' })
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateNewsCommentDto,
  ) {
    return this.newsService.addComment(id, req.user.sub, dto.content);
  }

  @ApiOperation({ summary: 'Проголосувати за новину (Лайк / Дизлайк)' })
  @ApiBody({ type: VoteNewsDto })
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: VoteNewsDto,
  ) {
    return this.newsService.vote(id, req.user.sub, dto.voteType);
  }
}