import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogAction, AuditLogResource } from '@prisma/client';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url.toLowerCase();

    // Skip GET requests, we only log mutations
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody) => {
        try {
          let action: AuditLogAction | null = null;
          let resource: AuditLogResource | null = null;

          // 1. Determine the Action
          if (url.includes('/auth/login') && method === 'POST') {
            action = AuditLogAction.LOGIN;
          } else if (method === 'POST') {
            action = AuditLogAction.CREATE;
          } else if (method === 'PATCH' || method === 'PUT') {
            action = AuditLogAction.UPDATE;
          } else if (method === 'DELETE') {
            action = AuditLogAction.DELETE;
          }

          // 2. Determine the Resource based on URL segment
          if (url.includes('/news')) resource = AuditLogResource.NEWS;
          else if (url.includes('/projects')) resource = AuditLogResource.PROJECT;
          else if (url.includes('/documents')) resource = AuditLogResource.DOCUMENT;
          else if (url.includes('/polls')) resource = AuditLogResource.POLL;
          else if (url.includes('/departments')) resource = AuditLogResource.DEPARTMENT;
          else if (url.includes('/chat')) resource = AuditLogResource.CHAT;
          else if (url.includes('/users') || url.includes('/auth')) resource = AuditLogResource.USER;
          else if (url.includes('/emergency-broadcasts')) resource = AuditLogResource.EMERGENCY_BROADCAST;

          if (action && resource) {
            // For login, the user ID is in the response body. For others, it's in the JWT token (req.user)
            let userId = req.user?.sub || null;
            
            if (action === AuditLogAction.LOGIN && responseBody?.user?.id) {
              userId = responseBody.user.id;
            }

            // Sanitize sensitive data before logging
            const body = { ...req.body };
            if (body.password) body.password = '***';
            if (body.newPassword) body.newPassword = '***';
            if (body.refreshToken) body.refreshToken = '***';

            // Save to the domain-specific AuditLog table
            this.prisma.auditLog.create({
              data: {
                action,
                resource,
                details: Object.keys(body).length ? body : null,
                ipAddress: req.ip || null,
                userId,
              }
            }).catch((err) => console.error('Audit Log Interceptor DB Error:', err));
          }
        } catch (error) {
          console.error('AuditInterceptor logic error:', error);
        }
      }),
    );
  }
}