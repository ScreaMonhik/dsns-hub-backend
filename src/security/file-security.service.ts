import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileSecurityService {
  /**
   * Validates the first 4 bytes of a file buffer to verify its binary signature.
   * PDF files MUST start with hex: 25 50 44 46 (%PDF)
   */
  async validatePdfSignature(buffer: Buffer): Promise<void> {
    if (buffer.length < 4) {
      throw new BadRequestException('Критична помилка: Файл занадто малий або пошкоджений.');
    }

    // %PDF -> 25 50 44 46
    if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      throw new BadRequestException('Критична помилка: Файл не є справжнім PDF-документом (Виявлено підробку сигнатури).');
    }
  }

  /**
   * Validates magic numbers for media files allowed in the News module:
   * JPEG, PNG, MP4, WEBM, OGG.
   */
  async validateMediaSignature(buffer: Buffer): Promise<void> {
    if (buffer.length < 8) {
      throw new BadRequestException('Критична помилка: Файл занадто малий або пошкоджений.');
    }

    const hex = buffer.subarray(0, 8).toString('hex').toUpperCase();
    const str = buffer.subarray(0, 8).toString('utf8');

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
      throw new BadRequestException('Критична помилка: Файл не є дозволеним медіаформатом (Виявлено підробку сигнатури).');
    }
  }
}