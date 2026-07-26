import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query, ParseIntPipe, DefaultValuePipe, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatService } from './chat.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { ManageMemberDto, PinChatDto, ReorderPinnedChatsDto, UpdateMemberRoleDto } from './dto/manage-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
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

@ApiOperation({ summary: 'Отримати список всіх груп (Тільки для ADMIN)' })
  @Roles(Role.ADMIN)
  @Get('groups/all')
  getAllGroups() {
    return this.chatService.getAllGroups();
  }

  @ApiOperation({ summary: 'Отримати список всіх груп користувача' })
  @Get('groups')
  getUserGroups(@Req() req: RequestWithUser) {
    return this.chatService.getUserGroups(req.user.sub);
  }

  @ApiOperation({ summary: 'Отримати історію повідомлень кімнати' })
  @Get('groups/:groupId/messages')
  getGroupMessages(@Param('groupId') groupId: string, @Req() req: RequestWithUser) {
    return this.chatService.getGroupMessages(groupId, req.user);
  }

@ApiOperation({ summary: 'Get list of group members' })
  @Get('groups/:groupId/members')
  getGroupMembers(@Param('groupId') groupId: string, @Req() req: RequestWithUser) {
    return this.chatService.getGroupMembers(groupId, req.user);
  }

  @ApiOperation({ summary: 'Додати користувача до групи або призначити адміном' })
  @Post('groups/:groupId/members')
  addMember(@Param('groupId') groupId: string, @Req() req: RequestWithUser, @Body() dto: ManageMemberDto) {
    return this.chatService.addMember(groupId, req.user, dto.userId, dto.isAdmin);
  }

  @ApiOperation({ summary: 'Видалити користувача з групи' })
  @Delete('groups/:groupId/members/:userId')
  removeMember(@Param('groupId') groupId: string, @Param('userId') userId: string, @Req() req: RequestWithUser) {
    return this.chatService.removeMember(groupId, req.user, userId);
  }

  @ApiOperation({ summary: 'Оновити роль учасника групи (Потрібні права адміна)' })
  @Patch('groups/:groupId/members/:userId/role')
  updateMemberRole(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.chatService.updateMemberRole(groupId, req.user, userId, dto.isAdmin);
  }

  @ApiOperation({ summary: 'Оновити аватар чату (Потрібні права адміна чату)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('groups/:groupId/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/chat',
        filename: (req, file, callback) => {
          const uniqueSuffix = uuidv4();
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async uploadAvatar(
    @Param('groupId') groupId: string,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const avatarUrl = `/uploads/chat/${file.filename}`;
    await this.chatService.updateAvatar(groupId, req.user, avatarUrl);

    return { url: avatarUrl };
  }

  @ApiOperation({ summary: 'Закріпити або відкріпити чат для поточного користувача' })
  @Patch('groups/:groupId/pin')
  pinGroup(@Param('groupId') groupId: string, @Req() req: RequestWithUser, @Body() dto: PinChatDto) {
    return this.chatService.pinGroup(groupId, req.user.sub, dto.isPinned);
  }

  @ApiOperation({ summary: 'Reorder pinned chats for current user' })
  @Patch('groups/pin/reorder')
  reorderPinnedGroups(@Req() req: RequestWithUser, @Body() dto: ReorderPinnedChatsDto) {
    return this.chatService.reorderPinnedGroups(req.user.sub, dto.groupIds);
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