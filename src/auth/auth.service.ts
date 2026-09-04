import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

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

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
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

    const sessionId = randomUUID();
    const tokens = await this.getTokens(user.id, user.email, user.role, sessionId);
    const hash = await bcrypt.hash(tokens.refreshToken, 10);
    
    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshToken: hash,
        ipAddress: ip,
        userAgent: userAgent,
      },
    });
    
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        forcePasswordChange: user.forcePasswordChange,
        createdAt: user.createdAt,
      },
    };
  }

  async logout(sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { id: sessionId },
    });
    return { message: 'Успішний вихід із системи' };
  }

  async refreshTokens(userId: string, sessionId: string, refreshToken: string, ip?: string, userAgent?: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.userId !== userId || !session.user.isActive) {
      throw new ForbiddenException('Доступ заборонено');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, session.refreshToken);
    if (!refreshTokenMatches) {
      throw new ForbiddenException('Доступ заборонено');
    }

    const tokens = await this.getTokens(userId, session.user.email, session.user.role, sessionId);
    const hash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshToken: hash,
        lastActiveAt: new Date(),
        ...(ip && { ipAddress: ip }),
        ...(userAgent && { userAgent }),
      },
    });

    return tokens;
  }

  async getSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: {
        userId,
        id: { not: currentSessionId },
      },
    });
    return { message: 'Всі інші сесії успішно завершені' };
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { userId, id: sessionId },
    });
    return { message: 'Сесію успішно завершено' };
  }

  async updateFcmToken(sessionId: string, fcmToken: string) {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { fcmToken },
    });
    return { message: 'FCM токен успішно оновлено для поточної сесії' };
  }

  private async getTokens(userId: string, email: string, role: string, sessionId: string) {
    const jwtPayload = { sub: userId, email, role, sessionId };

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
}