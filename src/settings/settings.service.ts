import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { BannerSeverity } from '@prisma/client';

@Injectable()
export class SettingsService {
  private readonly SETTINGS_ID = 'global';

  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.systemSetting.findUnique({
      where: { id: this.SETTINGS_ID },
    });

    if (!settings) {
      settings = await this.prisma.systemSetting.create({
        data: {
          id: this.SETTINGS_ID,
          maintenanceMode: false,
          globalBannerEnabled: false,
          globalBannerSeverity: BannerSeverity.INFO,
          maxPdfSizeMB: 20,
          maxMediaSizeMB: 100,
        },
      });
    }

    return settings;
  }

  async updateSettings(dto: UpdateSettingsDto, userId: string) {
    const updatedSettings = await this.prisma.systemSetting.upsert({
      where: { id: this.SETTINGS_ID },
      update: dto,
      create: {
        id: this.SETTINGS_ID,
        ...dto,
      },
    });

    await this.prisma.systemAuditLog.create({
      data: {
        entityName: 'SystemSetting',
        entityId: this.SETTINGS_ID,
        action: 'UPDATE',
        newValues: dto as any,
        userId,
      },
    });

    return updatedSettings;
  }
}