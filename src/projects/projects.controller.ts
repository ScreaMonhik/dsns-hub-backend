import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectCommentDto } from './dto/create-project-comment.dto';
import { VoteProjectDto } from './dto/vote-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ApiOperation({ summary: 'Створити новий проєкт/ініціативу (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'Отримати список всіх проєктів' })
  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @ApiOperation({ summary: 'Отримати деталі проєкту разом з коментарями та голосами' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @ApiOperation({ summary: 'Додати коментар до проєкту' })
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateProjectCommentDto,
  ) {
    return this.projectsService.addComment(id, req.user.sub, dto.content);
  }

  @ApiOperation({ summary: 'Проголосувати за проєкт (UPVOTE / DOWNVOTE)' })
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: VoteProjectDto,
  ) {
    return this.projectsService.vote(id, req.user.sub, dto.voteType);
  }
}