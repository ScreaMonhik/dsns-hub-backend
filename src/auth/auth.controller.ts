import { Controller, Post, Body, UseGuards, Req, UnauthorizedException, Get, Delete, Param, Ip, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role; sessionId: string };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @ApiOperation({ summary: 'Реєстрація нового співробітника' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Вхід у систему' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(dto, ip, userAgent);
  }

  @ApiOperation({ summary: 'Вихід із системи (анулювання поточної сесії)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: RequestWithUser) {
    return this.authService.logout(req.user.sessionId);
  }

  @ApiOperation({ summary: 'Оновлення токенів доступу' })
  @Post('refresh')
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    try {
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: 'super-secret-refresh-key', // TODO: Move to .env
      });
      return this.authService.refreshTokens(payload.sub, payload.sessionId, dto.refreshToken, ip, userAgent);
    } catch (e) {
      throw new UnauthorizedException('Недійсний або протермінований Refresh Token');
    }
  }

  @ApiOperation({ summary: 'Отримати список активних сесій поточного користувача' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  getSessions(@Req() req: RequestWithUser) {
    return this.authService.getSessions(req.user.sub, req.user.sessionId);
  }

  @ApiOperation({ summary: 'Завершити всі сесії поточного користувача, крім поточної' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/other')
  revokeOtherSessions(@Req() req: RequestWithUser) {
    return this.authService.revokeOtherSessions(req.user.sub, req.user.sessionId);
  }

  @ApiOperation({ summary: 'Завершити конкретну сесію поточного користувача' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  revokeSession(@Req() req: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(req.user.sub, sessionId);
  }
}