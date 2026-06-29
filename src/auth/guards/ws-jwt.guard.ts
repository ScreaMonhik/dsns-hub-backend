import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing WS token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'super-secret-key', // TODO: Move to .env
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true },
      });

      if (!user || !user.isActive) {
        throw new ForbiddenException('User account is inactive or deleted');
      }

      client.data.user = payload;
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Invalid or expired WS token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    return client.handshake.auth?.token;
  }
}