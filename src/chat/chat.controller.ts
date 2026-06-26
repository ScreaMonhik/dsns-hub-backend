import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { ManageMemberDto } from './dto/manage-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: 'Створити нову групу' })
  @Post('groups')
  createGroup(@Req() req: RequestWithUser, @Body() dto: CreateGroupDto) {
    return this.chatService.createGroup(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'Отримати список груп користувача' })
  @Get('groups')
  getUserGroups(@Req() req: RequestWithUser) {
    return this.chatService.getUserGroups(req.user.sub);
  }

  @ApiOperation({ summary: 'Отримати історію повідомлень кімнати' })
  @Get('groups/:groupId/messages')
  getGroupMessages(@Param('groupId') groupId: string, @Req() req: RequestWithUser) {
    return this.chatService.getGroupMessages(groupId, req.user.sub);
  }

  @ApiOperation({ summary: 'Додати користувача до групи' })
  @Post('groups/:groupId/members')
  addMember(@Param('groupId') groupId: string, @Req() req: RequestWithUser, @Body() dto: ManageMemberDto) {
    return this.chatService.addMember(groupId, req.user.sub, dto.userId);
  }

  @ApiOperation({ summary: 'Видалити користувача з групи' })
  @Delete('groups/:groupId/members/:userId')
  removeMember(@Param('groupId') groupId: string, @Param('userId') userId: string, @Req() req: RequestWithUser) {
    return this.chatService.removeMember(groupId, req.user.sub, userId);
  }

  @ApiOperation({ summary: 'Отримати аудит-лог повідомлень (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Get('audit-logs')
  getAuditLogs(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
  ) {
    return this.chatService.getAuditLogs(skip, take);
  }
}