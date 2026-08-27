import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmergencyBroadcastDto } from './dto/create-emergency-broadcast.dto';
import { QueryEmergencyBroadcastDto } from './dto/query-emergency-broadcast.dto';
import { BroadcastStatus, Prisma } from '@prisma/client';

@Injectable()
export class EmergencyBroadcastsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateEmergencyBroadcastDto) {
    if (dto.departmentIds && dto.departmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds } },
      });
      if (departments.length !== dto.departmentIds.length) {
        throw new BadRequestException('One or more department IDs do not exist');
      }
    }

    // Збереження в статусі PENDING
    const broadcast = await this.prisma.emergencyBroadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        severity: dto.severity,
        soundPreset: dto.soundPreset,
        status: BroadcastStatus.PENDING,
        authorId,
        departments: dto.departmentIds?.length
          ? { connect: dto.departmentIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    try {
      // TODO: Інтеграція з FCM/APNs для відправки Push-повідомлень.
      // const fcmResult = await this.pushNotificationService.sendAlert(broadcast);
      
      // Імітація успішної відправки (Mock)
      const mockRecipientCount = dto.departmentIds?.length ? 250 : 15000; 
      
      return await this.prisma.emergencyBroadcast.update({
        where: { id: broadcast.id },
        data: {
          status: BroadcastStatus.SENT,
          recipientCount: mockRecipientCount,
        },
        include: { departments: { select: { id: true, name: true } } },
      });
    } catch (error) {
      // Обробка помилки відправки
      return await this.prisma.emergencyBroadcast.update({
        where: { id: broadcast.id },
        data: { status: BroadcastStatus.FAILED },
      });
    }
  }

  async findAll(query: QueryEmergencyBroadcastDto) {
    const pageNumber = Math.max(1, Number(query.page) || 1);
    const limitNumber = Math.max(1, Number(query.limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.EmergencyBroadcastWhereInput = {};

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { body: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.emergencyBroadcast.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { departments: true } },
        },
      }),
      this.prisma.emergencyBroadcast.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNumber,
        lastPage: Math.ceil(total / limitNumber) || 1,
        limit: limitNumber,
      },
    };
  }

  async findOne(id: string) {
    const broadcast = await this.prisma.emergencyBroadcast.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        departments: { select: { id: true, name: true } },
      },
    });

    if (!broadcast) {
      throw new NotFoundException('Екстрене сповіщення не знайдено');
    }

    return broadcast;
  }
}