import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadDocument(title: string, departmentId: string, fileUrl: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('Вказаний підрозділ не знайдено');
    }

    return this.prisma.document.create({
      data: {
        title,
        fileUrl,
        departmentId,
      },
    });
  }

  async findAll(departmentId?: string) {
    return this.prisma.document.findMany({
      where: departmentId ? { departmentId } : {},
      include: {
        department: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}