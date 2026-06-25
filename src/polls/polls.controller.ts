import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('Polls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @ApiOperation({ summary: 'Створити опитування (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreatePollDto) {
    return this.pollsService.create(dto);
  }

  @ApiOperation({ summary: 'Отримати список опитувань (опціонально по підрозділу)' })
  @Get()
  findAll(@Query('departmentId') departmentId?: string) {
    return this.pollsService.findAll(departmentId);
  }

  @ApiOperation({ summary: 'Отримати конкретне опитування' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pollsService.findOne(id);
  }

  @ApiOperation({ summary: 'Проголосувати в опитуванні' })
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: VotePollDto,
  ) {
    return this.pollsService.vote(id, req.user.sub, dto.optionId);
  }
}