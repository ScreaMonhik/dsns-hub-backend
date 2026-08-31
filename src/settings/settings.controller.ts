import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { sub: string; email: string; role: Role };
}

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiOperation({ summary: 'Отримати глобальні налаштування системи (Публічний доступ)' })
  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @ApiOperation({ summary: 'Оновити глобальні налаштування (SUPER_ADMIN)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch()
  updateSettings(@Req() req: RequestWithUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto, req.user.sub);
  }
}