import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    NewsModule, 
    DepartmentsModule, 
    DocumentsModule, 
    ProjectsModule, 
    PollsModule, 
    ChatModule, 
    UsersModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}