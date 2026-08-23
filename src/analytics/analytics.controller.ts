import { Controller, Get, UseGuards, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ExportAnalyticsDto } from './dto/export-analytics.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: 'Get aggregated dashboard statistics (ADMIN only)' })
  @Roles(Role.ADMIN)
  @Get('dashboard')
  async getDashboard(@Query() query: QueryDashboardDto) {
    return this.analyticsService.getDashboardData(query);
  }

  @ApiOperation({ summary: 'Export analytics report to PDF or CSV (ADMIN only)' })
  @ApiProduces('application/pdf', 'text/csv')
  @Roles(Role.ADMIN)
  @Get('export')
  async exportAnalytics(
    @Query() query: ExportAnalyticsDto,
    @Res() res: Response,
  ) {
    const { stream, filename, contentType } = await this.analyticsService.exportData(query);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    stream.pipe(res);
  }
}