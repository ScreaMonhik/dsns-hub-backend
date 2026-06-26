import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

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
      // Прикріплюємо дані користувача до сокет-з'єднання
      client.data.user = payload;
      return true;
    } catch {
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