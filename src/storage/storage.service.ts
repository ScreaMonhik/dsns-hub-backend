import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName = process.env.MINIO_BUCKET_NAME || 'dsns-bucket';
  private readonly logger = new Logger(StorageService.name);

  constructor() {
    this.s3Client = new S3Client({
      region: 'us-east-1', // Default for MinIO
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'dsns_admin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'supersecretpassword',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    try {
      const uniqueSuffix = randomUUID();
      const ext = extname(file.originalname);
      const fileKey = `${folder}/${uniqueSuffix}${ext}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return fileKey;
    } catch (error) {
      this.logger.error('S3 Upload Error', error);
      throw new InternalServerErrorException('Помилка завантаження файлу у сховище');
    }
  }

  async deleteFile(fileKey: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${fileKey}`, error);
    }
  }

  async getFileStream(fileKey: string): Promise<{ stream: Readable; contentType: string; contentLength: number }> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch file from S3: ${fileKey}`, error);
      throw new InternalServerErrorException('Помилка отримання файлу зі сховища');
    }
  }

  async getFileRangeStream(
    fileKey: string,
    start: number,
    end: number,
  ): Promise<{ stream: Readable; contentType: string; contentLength: number }> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          Range: `bytes=${start}-${end}`,
        }),
      );

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || end - start + 1,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch file range from S3: ${fileKey}`, error);
      throw new InternalServerErrorException('Помилка отримання фрагмента файлу зі сховища');
    }
  }
}