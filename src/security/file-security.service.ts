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

  // Future-proofing: method for image validation (JPEG/PNG/WEBP) can be added here
}