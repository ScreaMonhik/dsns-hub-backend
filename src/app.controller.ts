import { Controller, Get, Param, Res, UseGuards, NotFoundException, BadRequestException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StorageService } from './storage/storage.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Secure file serving for chat with JWT validation' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('uploads/chat/:filename')
  serveChatFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.serveProtectedFile('chat', filename, res);
  }

  @ApiOperation({ summary: 'Secure file serving for news with JWT validation' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('uploads/news/:filename')
  serveNewsFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.serveProtectedFile('news', filename, res);
  }

  private async serveProtectedFile(folder: string, filename: string, res: Response): Promise<StreamableFile> {
    if (filename.includes('..') || filename.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }

    try {
      const fileKey = `${folder}/${filename}`;
      const { stream, contentType, contentLength } = await this.storageService.getFileStream(fileKey);

      res.set({
        'Content-Type': contentType,
        'Content-Length': contentLength.toString(),
      });

      return new StreamableFile(stream);
    } catch (error) {
      throw new NotFoundException('File not found in storage');
    }
  }
}