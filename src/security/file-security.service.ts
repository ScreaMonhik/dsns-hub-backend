import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';

@Injectable()
export class FileSecurityService {
  /**
   * Reads the first 4 bytes of a file on disk to verify its binary signature.
   * PDF files MUST start with hex: 25 50 44 46 (%PDF)
   */
  async validatePdfSignature(filePath: string): Promise<void> {
    let filehandle;
    try {
      filehandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(4);
      await filehandle.read(buffer, 0, 4, 0);
      
      // %PDF -> 25 50 44 46
      if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
        throw new Error('Invalid binary signature');
      }
    } catch (error) {
      // Wipe the potentially malicious file immediately
      await fs.unlink(filePath).catch(() => {
        console.error(`Failed to delete compromised file at: ${filePath}`);
      });
      throw new BadRequestException('Критична помилка: Файл не є справжнім PDF-документом (Виявлено підробку сигнатури).');
    } finally {
      if (filehandle) {
        await filehandle.close();
      }
    }
  }

  /**
   * Validates magic numbers for media files allowed in the News module:
   * JPEG, PNG, MP4, WEBM, OGG.
   */
  async validateMediaSignature(filePath: string): Promise<void> {
    let filehandle;
    try {
      filehandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(8);
      await filehandle.read(buffer, 0, 8, 0);

      const hex = buffer.toString('hex').toUpperCase();
      const str = buffer.toString('utf8');

      // JPEG: FF D8 FF
      const isJpeg = hex.startsWith('FFD8FF');
      // PNG: 89 50 4E 47
      const isPng = hex.startsWith('89504E47');
      // MP4: 'ftyp' starting at byte offset 4
      const isMp4 = str.substring(4, 8) === 'ftyp';
      // WEBM / MKV: 1A 45 DF A3
      const isWebm = hex.startsWith('1A45DFA3');
      // OGG: 'OggS'
      const isOgg = hex.startsWith('4F676753');

      if (!isJpeg && !isPng && !isMp4 && !isWebm && !isOgg) {
        throw new Error('Invalid media binary signature');
      }
    } catch (error) {
      await fs.unlink(filePath).catch(() => {
        console.error(`Failed to delete compromised media file at: ${filePath}`);
      });
      throw new BadRequestException('Критична помилка: Файл не є дозволеним медіаформатом (Виявлено підробку сигнатури).');
    } finally {
      if (filehandle) {
        await filehandle.close();
      }
    }
  }
}