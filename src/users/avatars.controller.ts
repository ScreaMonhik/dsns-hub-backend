import { Controller, Get, Param, NotFoundException, StreamableFile, Res } from '@nestjs/common';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';

@Controller('uploads/avatars')
export class AvatarsController {
  @Get(':filename')
  async serveAvatar(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: any
  ): Promise<StreamableFile> {
    if (filename.includes('..') || filename.includes('/')) {
      throw new NotFoundException('Invalid file path');
    }

    const filePath = join(process.cwd(), 'uploads', 'avatars', filename);

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new NotFoundException('Not a file');
      }
    } catch (error) {
      throw new NotFoundException('Avatar not found on disk');
    }

    if (filename.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filename.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else {
      res.setHeader('Content-Type', 'image/jpeg');
    }

    const fileStream = createReadStream(filePath);
    return new StreamableFile(fileStream);
  }
}