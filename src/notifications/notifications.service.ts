import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private isInitialized = false;

  onModuleInit() {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase configuration is missing. Push notifications are disabled.');
        return;
      }

      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  async sendMulticast(tokens: string[], title: string, body: string, data?: Record<string, string>) {
    if (!this.isInitialized || tokens.length === 0) {
      return { successCount: 0, failureCount: tokens.length };
    }

    const payload: MulticastMessage = {
      tokens,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'emergency_alerts',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    };

    try {
      // Firebase allows max 500 tokens per multicast request
      const CHUNK_SIZE = 500;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
        const chunk = tokens.slice(i, i + CHUNK_SIZE);
        payload.tokens = chunk;
        const response = await getMessaging().sendEachForMulticast(payload);
        successCount += response.successCount;
        failureCount += response.failureCount;
      }

      this.logger.log(`Push notifications sent. Success: ${successCount}, Failures: ${failureCount}`);
      return { successCount, failureCount };
    } catch (error) {
      this.logger.error('Error sending push notifications', error);
      return { successCount: 0, failureCount: tokens.length };
    }
  }
}