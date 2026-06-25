import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Критична перевірка email-адреси
    if (!dto.email.endsWith('@dsns.gov.ua')) {
      throw new ForbiddenException(
        'Реєстрація дозволена лише для співробітників з доменом @dsns.gov.ua',
      );
    }

    // 2. Перевірка, чи не існує вже такого користувача
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    
    if (existingUser) {
      throw new ForbiddenException('Користувач з таким email вже існує');
    }

    // 3. Хешування пароля за допомогою bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 4. Збереження в базу даних
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    return {
      message: 'Користувача успішно зареєстровано',
      userId: user.id,
    };
  }

  async login(dto: LoginDto) {
    // 1. Шукаємо користувача
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    // 2. Перевіряємо хеш пароля
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    // 3. Генеруємо JWT токен
    const payload = { sub: user.id, email: user.email };
    
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}