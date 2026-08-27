import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';
import { CreateEmergencyBroadcastDto } from './dto/create-emergency-broadcast.dto';
import { QueryEmergencyBroadcastDto } from './dto/query-emergency-broadcast.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('Emergency Broadcasts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('emergency-broadcasts')
export class EmergencyBroadcastsController {
  constructor(private readonly broadcastService: EmergencyBroadcastsService) {}

  @ApiOperation({ summary: 'Створення та відправка екстреного сповіщення (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateEmergencyBroadcastDto) {
    return this.broadcastService.create(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'Отримання списку розсилок (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: QueryEmergencyBroadcastDto) {
    return this.broadcastService.findAll(query);
  }

  @ApiOperation({ summary: 'Отримання детального звіту по конкретній розсилці (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.broadcastService.findOne(id);
  }
}