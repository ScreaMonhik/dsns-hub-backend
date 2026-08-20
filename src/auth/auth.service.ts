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
        departmentId: dto.departmentId,
      },
    });

    return {
      message: 'Користувача успішно зареєстровано',
      userId: user.id,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Ваш обліковий запис заблоковано. Зверніться до адміністратора.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    
    if (!isPasswordValid) {
      const newAttemptsCount = user.failedLoginAttempts + 1;
      
      if (newAttemptsCount >= 5) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: false, failedLoginAttempts: newAttemptsCount },
        });
        throw new ForbiddenException('Занадто багато невдалих спроб. Ваш обліковий запис заблоковано.');
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: newAttemptsCount },
        });
        throw new UnauthorizedException('Невірний email або пароль');
      }
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0 },
      });
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, refreshToken: { not: null } },
      data: { refreshToken: null },
    });
    return { message: 'Успішний вихід із системи' };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken || !user.isActive) {
      throw new ForbiddenException('Доступ заборонено');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!refreshTokenMatches) {
      throw new ForbiddenException('Доступ заборонено');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  private async getTokens(userId: string, email: string, role: string) {
    const jwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: 'super-secret-key', // TODO: Move to .env
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: 'super-secret-refresh-key', // TODO: Move to .env
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const saltRounds = 10;
    const hash = await bcrypt.hash(refreshToken, saltRounds);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }
}