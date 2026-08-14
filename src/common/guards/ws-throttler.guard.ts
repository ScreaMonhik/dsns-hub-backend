import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler } = requestProps;
    const client = context.switchToWs().getClient();
    
    // Fallback to connection remote address if handshake address is missing
    const ip = client.handshake?.address || client.conn?.remoteAddress || 'unknown';
    
    const name = (throttler.name as string) || 'default';
    const blockDuration = (throttler.blockDuration as number) || 0;

    const key = this.generateKey(context, ip, name);
    
    const { totalHits } = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      name,
    );

    if (totalHits > limit) {
      throw new WsException('Перевищено ліміт запитів (Rate Limit). Зачекайте хвилину.');
    }

    return true;
  }
}