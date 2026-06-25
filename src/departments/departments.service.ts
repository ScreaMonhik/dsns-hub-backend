import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto) {
    const exists = await this.prisma.department.findUnique({
      where: { name: dto.name },
    });

    if (exists) {
      throw new ConflictException('Підрозділ з такою назвою вже існує');
    }

    return this.prisma.department.create({
      data: { name: dto.name },
    });
  }

  async findAll() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
  }
}