import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '@prisma/client';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(creatorId: string, dto: CreateGroupDto) {
    const allMembers = Array.from(new Set([...dto.memberIds, creatorId]));

    return this.prisma.chatGroup.create({
      data: {
        name: dto.name,
        members: {
          create: allMembers.map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    });
  }

  async getUserGroups(userId: string) {
    return this.prisma.chatGroup.findMany({
      where: { members: { some: { userId } } },
      include: {
        _count: { select: { members: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }, // Останнє повідомлення
      },
    });
  }

  async getGroupMessages(groupId: string, userId: string) {
    await this.verifyMembership(groupId, userId);
    return this.prisma.chatMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  async saveMessage(groupId: string, senderId: string, content: string) {
    await this.verifyMembership(groupId, senderId);
    return this.prisma.chatMessage.create({
      data: { groupId, senderId, content },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException('You can only edit your own messages');
    if (message.isDeleted) throw new ForbiddenException('Cannot edit a deleted message');

    return this.prisma.$transaction(async (tx) => {
      // 1. Створюємо Audit Log
      await tx.messagesAuditLog.create({
        data: {
          messageId,
          oldContent: message.content,
          action: AuditAction.UPDATED,
          userId,
        },
      });

      // 2. Оновлюємо повідомлення
      return tx.chatMessage.update({
        where: { id: messageId },
        data: { content: newContent },
        include: { sender: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException('You can only delete your own messages');

    return this.prisma.$transaction(async (tx) => {
      await tx.messagesAuditLog.create({
        data: {
          messageId,
          oldContent: message.content,
          action: AuditAction.DELETED,
          userId,
        },
      });

      return tx.chatMessage.update({
        where: { id: messageId },
        data: { content: '[Повідомлення видалено]', isDeleted: true },
        include: { sender: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
  }

  private async verifyMembership(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }
  }

  async addMember(groupId: string, adminId: string, userIdToAdd: string) {
    await this.verifyMembership(groupId, adminId);

    const existingMembership = await this.prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: userIdToAdd,
          groupId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException('Користувач вже є учасником цієї групи');
    }

    return this.prisma.groupMember.create({
      data: { groupId, userId: userIdToAdd },
    });
  }

  async removeMember(groupId: string, adminId: string, userIdToRemove: string) {
    await this.verifyMembership(groupId, adminId);
    return this.prisma.groupMember.delete({
      where: { userId_groupId: { userId: userIdToRemove, groupId } },
    });
  }

  async getAuditLogs(skip: number = 0, take: number = 50) {
    return this.prisma.messagesAuditLog.findMany({
      skip,
      take,
      orderBy: { changedAt: 'desc' },
      include: { 
        changedBy: { select: { id: true, firstName: true, lastName: true, email: true } } 
      },
    });
  }
}