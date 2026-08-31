import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Prisma } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateUserDto) {
    if (!dto.email.endsWith('@dsns.gov.ua')) {
      throw new ForbiddenException('Реєстрація дозволена лише для співробітників з доменом @dsns.gov.ua');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    
    if (existingUser) {
      throw new BadRequestException('Користувач з таким email вже існує');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        departmentId: dto.departmentId,
        role: dto.role ?? 'USER',
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });
  }

  async findAll(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    
    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    await this.prisma.user.delete({ where: { id } });
    return { message: 'Користувача успішно видалено з системи' };
  }

  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    // Автоматична генерація надійного тимчасового пароля, який проходить валідацію DTO (мінімум 8 символів, велика, мала, цифра, спецсимвол)
    const tempPassword = randomBytes(4).toString('hex') + 'A1!'; 
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    await this.prisma.user.update({
      where: { id },
      data: { 
        passwordHash: hashedPassword,
        forcePasswordChange: true 
      },
    });

    return { 
      message: 'Пароль успішно скинуто',
      tempPassword 
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true, parentId: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileKey = await this.storageService.uploadFile(file, 'avatars');
    const avatarUrl = `/uploads/avatars/${fileKey.split('/').pop()}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const isPasswordValid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Поточний пароль вказано неправильно');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        passwordHash: hashedPassword,
        forcePasswordChange: false 
      },
    });

    return { message: 'Пароль успішно змінено' };
  }
}