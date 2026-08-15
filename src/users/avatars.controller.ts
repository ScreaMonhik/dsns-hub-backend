import { Controller, Get, Param, NotFoundException, StreamableFile, Res } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import type { Response } from 'express';

@Controller('uploads/avatars')
export class AvatarsController {
  constructor(private readonly storageService: StorageService) {}

  @Get(':filename')
  async serveAvatar(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (filename.includes('..') || filename.includes('/')) {
      throw new NotFoundException('Invalid file path');
    }

    try {
      const fileKey = `avatars/${filename}`;
      const { stream, contentType, contentLength } = await this.storageService.getFileStream(fileKey);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', contentLength.toString());
      
      return new StreamableFile(stream);
    } catch (error) {
      throw new NotFoundException('Avatar not found on storage');
    }
  }
}