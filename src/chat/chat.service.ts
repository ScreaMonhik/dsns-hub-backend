import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, Role } from '@prisma/client';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(creatorId: string, dto: CreateGroupDto) {
    const membersData: { userId: string; isAdmin: boolean }[] = [];
    
    // Creator is always an admin of the group they create
    membersData.push({ userId: creatorId, isAdmin: true });

    if (dto.adminIds) {
      dto.adminIds.forEach((id) => {
        if (id !== creatorId) membersData.push({ userId: id, isAdmin: true });
      });
    }

    if (dto.memberIds) {
      dto.memberIds.forEach((id) => {
        if (!membersData.some((m) => m.userId === id)) {
          membersData.push({ userId: id, isAdmin: false });
        }
      });
    }

    return this.prisma.chatGroup.create({
      data: {
        name: dto.name,
        departmentId: dto.departmentId,
        avatarUrl: dto.avatarUrl,
        members: {
          create: membersData,
        },
      },
      include: { members: true },
    });
  }

  async getUserGroups(userId: string, userRole: Role) {
    if (userRole === Role.ADMIN) {
      return this.prisma.chatGroup.findMany({
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { members: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.chatGroup.findMany({
      where: { members: { some: { userId } } },
      include: {
        department: { select: { id: true, name: true } },
        // Повертаємо pinOrder для сортування на стороні клієнта
        members: { where: { userId }, select: { isPinned: true, pinOrder: true, isAdmin: true } },
        _count: { select: { members: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async getGroupMessages(groupId: string, user: { sub: string; role: Role }) {
    await this.verifyMembership(groupId, user);
    return this.prisma.chatMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  async saveMessage(groupId: string, user: { sub: string; role: Role }, content: string) {
    await this.verifyMembership(groupId, user);
    return this.prisma.chatMessage.create({
      data: { groupId, senderId: user.sub, content },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  async editMessage(messageId: string, user: { sub: string; role: Role }, newContent: string) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== user.sub && user.role !== Role.ADMIN) throw new ForbiddenException('You can only edit your own messages');
    if (message.isDeleted) throw new ForbiddenException('Cannot edit a deleted message');

    return this.prisma.$transaction(async (tx) => {
      await tx.messagesAuditLog.create({
        data: {
          messageId,
          oldContent: message.content,
          action: AuditAction.UPDATED,
          userId: user.sub,
        },
      });

      return tx.chatMessage.update({
        where: { id: messageId },
        data: { content: newContent },
        include: { sender: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
  }

  async deleteMessage(messageId: string, user: { sub: string; role: Role }) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    
    // Check if user is the sender, a global admin, or a group admin
    let hasRights = message.senderId === user.sub || user.role === Role.ADMIN;
    
    if (!hasRights) {
      const membership = await this.prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: user.sub, groupId: message.groupId } }
      });
      if (membership?.isAdmin) hasRights = true;
    }

    if (!hasRights) throw new ForbiddenException('Insufficient permissions to delete this message');

    return this.prisma.$transaction(async (tx) => {
      await tx.messagesAuditLog.create({
        data: {
          messageId,
          oldContent: message.content,
          action: AuditAction.DELETED,
          userId: user.sub,
        },
      });

      return tx.chatMessage.update({
        where: { id: messageId },
        data: { content: '[Повідомлення видалено]', isDeleted: true },
        include: { sender: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
  }

  private async verifyMembership(groupId: string, user: { sub: string; role: Role }, requireGroupAdmin: boolean = false) {
    if (user.role === Role.ADMIN) return true; // Global admin bypasses membership checks

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: user.sub, groupId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }

    if (requireGroupAdmin && !membership.isAdmin) {
      throw new ForbiddenException('You must be a group admin to perform this action');
    }

    return membership;
  }

  async addMember(groupId: string, adminUser: { sub: string; role: Role }, userIdToAdd: string, assignAsAdmin: boolean = false) {
    await this.verifyMembership(groupId, adminUser, true);

    const existingMembership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: userIdToAdd, groupId } },
    });

    if (existingMembership) {
      throw new ConflictException('User is already in this group');
    }

    return this.prisma.groupMember.create({
      data: { groupId, userId: userIdToAdd, isAdmin: assignAsAdmin },
    });
  }

  async removeMember(groupId: string, adminUser: { sub: string; role: Role }, userIdToRemove: string) {
    await this.verifyMembership(groupId, adminUser, true);
    return this.prisma.groupMember.delete({
      where: { userId_groupId: { userId: userIdToRemove, groupId } },
    });
  }

  async updateAvatar(groupId: string, adminUser: { sub: string; role: Role }, avatarUrl: string) {
    await this.verifyMembership(groupId, adminUser, true);
    return this.prisma.chatGroup.update({
      where: { id: groupId },
      data: { avatarUrl },
    });
  }

  async pinGroup(groupId: string, userId: string, isPinned: boolean) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    // Очищаємо pinOrder, якщо чат відкріплюється
    const pinOrder = isPinned ? 0 : null;

    if (!membership) {
      return this.prisma.groupMember.create({
        data: { groupId, userId, isPinned, pinOrder }
      });
    }

    return this.prisma.groupMember.update({
      where: { userId_groupId: { userId, groupId } },
      data: { isPinned, pinOrder },
    });
  }

  async reorderPinnedGroups(userId: string, groupIds: string[]) {
    // Використовуємо транзакцію для атомарного оновлення всіх індексів
    return this.prisma.$transaction(
      groupIds.map((groupId, index) =>
        this.prisma.groupMember.update({
          where: { userId_groupId: { userId, groupId } },
          data: { isPinned: true, pinOrder: index },
        })
      )
    );
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