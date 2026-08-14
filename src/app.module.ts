import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NewsModule } from './news/news.module';
import { DepartmentsModule } from './departments/departments.module';
import { DocumentsModule } from './documents/documents.module';
import { ProjectsModule } from './projects/projects.module';
import { PollsModule } from './polls/polls.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SecurityModule,
    // Global rate limit: max 100 requests per 1 minute per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    AuthModule,
    NewsModule, 
    DepartmentsModule, 
    DocumentsModule, 
    ProjectsModule, 
    PollsModule, 
    ChatModule, 
    UsersModule, SecurityModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}