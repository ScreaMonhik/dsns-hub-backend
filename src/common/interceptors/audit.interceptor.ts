import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    
    if (req && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        const userId = req.user?.sub || null;
        const body = { ...req.body };
        
        // Sanitize sensitive data before logging
        if (body.password) body.password = '***';
        if (body.newPassword) body.newPassword = '***';
        if (body.refreshToken) body.refreshToken = '***';

        // Fire and forget API log to avoid blocking the request
        this.prisma.apiAuditLog.create({
            data: {
                method: req.method,
                url: req.url,
                payload: Object.keys(body).length ? body : null,
                ipAddress: req.ip || null,
                userId,
            }
        }).catch((err) => console.error('Global Audit Log Error:', err));
    }

    return next.handle();
  }
}