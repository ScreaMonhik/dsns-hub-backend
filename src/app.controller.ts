import { Controller, Get, Param, Res, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Secure file serving with JWT validation' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('uploads/:folder/:filename')
  serveProtectedFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Validate allowed directories to prevent arbitrary folder access
    const allowedFolders = ['chat', 'news'];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException('Access to this directory is forbidden');
    }

    // Path Traversal protection
    if (filename.includes('..') || filename.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }

    const filePath = join(process.cwd(), 'uploads', folder, filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(filePath);
  }
}