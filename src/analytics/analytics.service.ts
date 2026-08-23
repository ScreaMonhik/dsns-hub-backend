import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExportAnalyticsDto, ExportFormat } from './dto/export-analytics.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';

export interface AnalyticsSummary {
  users: { total: number; active: number; blocked: number; admins: number };
  projects: { total: number; draft: number; published: number; archived: number };
  news: { total: number; draft: number; published: number; archived: number };
  polls: { total: number; active: number; archived: number; totalVotes: number };
}

export interface DailyDynamic {
  date: string;
  newUsers: number;
  newProjects: number;
  votes: number;
  engagements: number;
  comments: number;
}

export interface DashboardAnalyticsResponse {
  summary: {
    users: { total: number; active: number; blocked: number; admins: number };
    projects: { total: number; draft: number; published: number; archived: number };
    news: { total: number; draft: number; published: number; archived: number };
    polls: { total: number; active: number; archived: number; totalVotes: number };
  };
  activityChart: Array<{
    date: string;
    newUsers: number;
    newProjects: number;
    votes: number;
    engagements: number;
    comments: number;
  }>;
  recentActivity: {
        latestUsers: Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          createdAt: string;
        }>;
        pendingDrafts: Array<{
          id: string;
          title: string;
          type: 'NEWS' | 'PROJECT' | 'POLL' | 'DOCUMENT';
          authorName: string;
          createdAt: string;
        }>;
      };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardData(query?: QueryDashboardDto): Promise<DashboardAnalyticsResponse> {
    // 1. Fetch Aggregated Summary Data concurrently
    const [
      userStats,
      projectStats,
      newsStats,
      pollStats,
      pollTotalVotes,
      latestUsers,
      pendingProjects,
      pendingNews,
      pendingPolls,
      pendingDocs,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['isActive', 'role'], _count: { id: true } }),
      this.prisma.project.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.news.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.poll.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.pollVote.count(),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
      }),
      this.prisma.project.findMany({
        where: { status: 'DRAFT' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, author: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.news.findMany({
        where: { status: 'DRAFT' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, author: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.poll.findMany({
        where: { status: 'DRAFT' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, author: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.document.findMany({
        where: { status: 'DRAFT' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, author: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    // 2. Process Activity Chart Data
    const endDate = query?.endDate ? new Date(query.endDate) : new Date();
    const startDate = query?.startDate ? new Date(query.startDate) : new Date(endDate.getTime() - 13 * 24 * 60 * 60 * 1000);

    // Set defaults ONLY if dates were not provided by frontend (to avoid overriding frontend's precise ISO timezone)
    if (!query?.endDate) endDate.setUTCHours(23, 59, 59, 999);
    if (!query?.startDate) startDate.setUTCHours(0, 0, 0, 0);

    if (startDate > endDate) {
      throw new BadRequestException('startDate не може бути більшим за endDate');
    }

    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const isMonthly = diffDays > 60; // Group by month if the range is greater than ~2 months

    const [
      recentUsers, 
      recentProjects, 
      recentProjectVotes, 
      recentNewsVotes, 
      recentPollVotes,
      recentProjectComments,
      recentNewsComments,
    ] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.project.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.projectVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.newsVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.pollVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.projectComment.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.newsComment.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
    ]);

    const buckets: string[] = [];
    
    if (isMonthly) {
      const currentMonth = new Date(startDate);
      currentMonth.setUTCDate(1);
      currentMonth.setUTCHours(12, 0, 0, 0); // Align to noon UTC to safely increment months
      
      const endMonth = new Date(endDate);
      endMonth.setUTCDate(1);
      endMonth.setUTCHours(12, 0, 0, 0);
      
      while (currentMonth <= endMonth) {
        buckets.push(currentMonth.toISOString().substring(0, 7)); // Output format: 'YYYY-MM'
        currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
      }
    } else {
      const currentDate = new Date(startDate);
      currentDate.setUTCHours(12, 0, 0, 0); // Start at noon UTC to prevent daylight saving boundary shifts
      
      const stopDate = new Date(endDate);
      stopDate.setUTCHours(12, 0, 0, 0);
      
      while (currentDate <= stopDate) {
        buckets.push(currentDate.toISOString().substring(0, 10)); // Output format: 'YYYY-MM-DD'
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }

    const activityChart = buckets.map(bucketStr => {
      // Using .startsWith handles both 'YYYY-MM' and 'YYYY-MM-DD' correctly
      const filterByBucket = (item: { createdAt: Date }) => item.createdAt.toISOString().startsWith(bucketStr);

      return {
        date: bucketStr,
        newUsers: recentUsers.filter(filterByBucket).length,
        newProjects: recentProjects.filter(filterByBucket).length,
        votes: recentPollVotes.filter(filterByBucket).length,
        engagements: 
          recentProjectVotes.filter(filterByBucket).length +
          recentNewsVotes.filter(filterByBucket).length,
        comments:
          recentProjectComments.filter(filterByBucket).length +
          recentNewsComments.filter(filterByBucket).length,
      };
    });

    // 3. Normalize and sort all drafts
    const allDrafts = [
      ...pendingProjects.map((p) => ({
        id: p.id,
        title: p.title,
        type: 'PROJECT' as const,
        authorName: `${p.author.lastName} ${p.author.firstName}`.trim(),
        createdAt: p.createdAt,
      })),
      ...pendingNews.map((n) => ({
        id: n.id,
        title: n.title,
        type: 'NEWS' as const,
        authorName: `${n.author.lastName} ${n.author.firstName}`.trim(),
        createdAt: n.createdAt,
      })),
      ...pendingPolls.map((p) => ({
        id: p.id,
        title: p.title,
        type: 'POLL' as const,
        authorName: p.author ? `${p.author.lastName} ${p.author.firstName}`.trim() : 'Невідомо',
        createdAt: p.createdAt,
      })),
      ...pendingDocs.map((d) => ({
        id: d.id,
        title: d.title,
        type: 'DOCUMENT' as const,
        authorName: d.author ? `${d.author.lastName} ${d.author.firstName}`.trim() : 'Невідомо',
        createdAt: d.createdAt,
      })),
    ];

    allDrafts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 4. Format Response
    return {
      summary: {
        users: {
          total: userStats.reduce((acc, curr) => acc + curr._count.id, 0),
          active: userStats.filter((s) => s.isActive).reduce((acc, curr) => acc + curr._count.id, 0),
          blocked: userStats.filter((s) => !s.isActive).reduce((acc, curr) => acc + curr._count.id, 0),
          admins: userStats.filter((s) => s.role === 'ADMIN').reduce((acc, curr) => acc + curr._count.id, 0),
        },
        projects: {
          total: projectStats.reduce((acc, curr) => acc + curr._count.id, 0),
          draft: projectStats.find((s) => s.status === 'DRAFT')?._count.id || 0,
          published: projectStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
          archived: projectStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
        },
        news: {
          total: newsStats.reduce((acc, curr) => acc + curr._count.id, 0),
          draft: newsStats.find((s) => s.status === 'DRAFT')?._count.id || 0,
          published: newsStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
          archived: newsStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
        },
        polls: {
          total: pollStats.reduce((acc, curr) => acc + curr._count.id, 0),
          active: pollStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
          archived: pollStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
          totalVotes: pollTotalVotes,
        },
      },
      activityChart,
      recentActivity: {
        latestUsers: latestUsers.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
        pendingDrafts: allDrafts.slice(0, 5).map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
        })),
      },
    };
  }

  async exportData(dto: ExportAnalyticsDto) {
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    if (startDate > endDate) {
      throw new BadRequestException('startDate не може бути більшим за endDate');
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const [
      userStats, projectStats, newsStats, pollStats, pollTotalVotes,
      usersRange, projectsRange, pollVotesRange, projectVotesRange, 
      newsVotesRange, projectCommentsRange, newsCommentsRange
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['isActive', 'role'], _count: { id: true } }),
      this.prisma.project.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.news.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.poll.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.pollVote.count(),
      this.prisma.user.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.project.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.pollVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.projectVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.newsVote.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.projectComment.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
      this.prisma.newsComment.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, select: { createdAt: true } }),
    ]);

    const summary = {
      users: {
        total: userStats.reduce((acc, curr) => acc + curr._count.id, 0),
        active: userStats.filter((s) => s.isActive).reduce((acc, curr) => acc + curr._count.id, 0),
        blocked: userStats.filter((s) => !s.isActive).reduce((acc, curr) => acc + curr._count.id, 0),
        admins: userStats.filter((s) => s.role === 'ADMIN').reduce((acc, curr) => acc + curr._count.id, 0),
      },
      projects: {
        total: projectStats.reduce((acc, curr) => acc + curr._count.id, 0),
        draft: projectStats.find((s) => s.status === 'DRAFT')?._count.id || 0,
        published: projectStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
        archived: projectStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
      },
      news: {
        total: newsStats.reduce((acc, curr) => acc + curr._count.id, 0),
        draft: newsStats.find((s) => s.status === 'DRAFT')?._count.id || 0,
        published: newsStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
        archived: newsStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
      },
      polls: {
        total: pollStats.reduce((acc, curr) => acc + curr._count.id, 0),
        active: pollStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
        archived: pollStats.find((s) => s.status === 'ARCHIVED')?._count.id || 0,
        totalVotes: pollTotalVotes,
      },
    };

    const daysMap = new Map<string, any>();
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      daysMap.set(d.toISOString().split('T')[0], { newUsers: 0, newProjects: 0, votes: 0, engagements: 0, comments: 0 });
    }

    const countByDate = (items: { createdAt: Date }[], key: string) => {
      items.forEach(item => {
        const dateStr = item.createdAt.toISOString().split('T')[0];
        if (daysMap.has(dateStr)) {
          daysMap.get(dateStr)[key]++;
        }
      });
    };

    countByDate(usersRange, 'newUsers');
    countByDate(projectsRange, 'newProjects');
    countByDate(pollVotesRange, 'votes');
    countByDate(projectVotesRange, 'engagements');
    countByDate(newsVotesRange, 'engagements');
    countByDate(projectCommentsRange, 'comments');
    countByDate(newsCommentsRange, 'comments');

    const dynamics = Array.from(daysMap.entries()).map(([date, metrics]) => ({ date, ...metrics }));
    const dateStamp = new Date().toISOString().split('T')[0];

    if (dto.format === ExportFormat.CSV) {
      return {
        stream: this.generateCsvStream(summary, dynamics),
        filename: `dsns_report_${dateStamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    } else {
      return {
        stream: this.generatePdfStream(summary, dynamics, startDate, endDate),
        filename: `dsns_report_${dateStamp}.pdf`,
        contentType: 'application/pdf',
      };
    }
  }

  private generateCsvStream(summary: AnalyticsSummary, dynamics: DailyDynamic[]): Readable {
    const csvRows: string[] = [];
    csvRows.push('\uFEFF'); // BOM for Excel UTF-8 support
    csvRows.push('--- DSNS HUB ANALYTICS REPORT ---');
    csvRows.push('SUMMARY');
    csvRows.push(`Users;Total:${summary.users.total};Active:${summary.users.active};Blocked:${summary.users.blocked};Admins:${summary.users.admins}`);
    csvRows.push(`Projects;Total:${summary.projects.total};Drafts:${summary.projects.draft};Published:${summary.projects.published};Archived:${summary.projects.archived}`);
    csvRows.push(`News;Total:${summary.news.total};Drafts:${summary.news.draft};Published:${summary.news.published};Archived:${summary.news.archived}`);
    csvRows.push(`Polls;Total:${summary.polls.total};Active:${summary.polls.active};Archived:${summary.polls.archived};TotalVotes:${summary.polls.totalVotes}`);
    csvRows.push('');
    csvRows.push('DYNAMICS (DAILY)');
    csvRows.push('Date;New Users;New Projects;Poll Votes;Engagements (Likes/Dislikes);Comments');
    
    dynamics.forEach(row => {
      csvRows.push(`${row.date};${row.newUsers};${row.newProjects};${row.votes};${row.engagements};${row.comments}`);
    });

    return Readable.from(csvRows.join('\n'));
  }

  private drawLineChart(doc: typeof PDFDocument, dynamics: DailyDynamic[], x: number, y: number, width: number, height: number) {
    const maxVal = Math.max(...dynamics.map(d => Math.max(d.newUsers, d.newProjects, d.votes, d.engagements, d.comments)), 5); 

    // Draw Y axis and horizontal grid
    doc.lineWidth(0.5).strokeColor('#E2E8F0');
    for (let i = 0; i <= 5; i++) {
      const gridY = y + height - (i / 5) * height;
      doc.moveTo(x, gridY).lineTo(x + width, gridY).stroke();
      
      doc.fontSize(8).fillColor('#94A3B8').text(
        Math.round((i / 5) * maxVal).toString(), 
        x - 25, 
        gridY - 4, 
        { width: 20, align: 'right' }
      );
    }

    // X axis labels
    doc.fontSize(8).fillColor('#94A3B8');
    dynamics.forEach((d, i) => {
      if (i % 2 === 0 || i === dynamics.length - 1) { 
        const ptX = x + (i / (dynamics.length - 1 || 1)) * width;
        const dateStr = d.date.split('-').slice(1).join('/'); 
        doc.text(dateStr, ptX - 15, y + height + 8, { width: 30, align: 'center' });
      }
    });

    // Draw Data Series
    const drawSeries = (key: keyof DailyDynamic, color: string) => {
      doc.lineWidth(2).strokeColor(color);
      let pathStarted = false;
      dynamics.forEach((d, i) => {
        const val = Number(d[key]);
        const ptX = x + (i / (dynamics.length - 1 || 1)) * width;
        const ptY = y + height - (val / maxVal) * height;
        
        if (!pathStarted) {
          doc.moveTo(ptX, ptY);
          pathStarted = true;
        } else {
          doc.lineTo(ptX, ptY);
        }
      });
      doc.stroke();
    };

    drawSeries('engagements', '#3B82F6'); // Blue
    drawSeries('votes', '#10B981'); // Green
    drawSeries('comments', '#F59E0B'); // Orange

    // Legend
    const legendY = y + height + 30;
    
    doc.rect(x + 40, legendY, 10, 10).fill('#3B82F6');
    doc.fillColor('#333333').text('Engagements (Likes/Dislikes)', x + 55, legendY + 1);

    doc.rect(x + 210, legendY, 10, 10).fill('#10B981');
    doc.fillColor('#333333').text('Poll Votes', x + 225, legendY + 1);

    doc.rect(x + 300, legendY, 10, 10).fill('#F59E0B');
    doc.fillColor('#333333').text('Comments', x + 315, legendY + 1);
  }

  private generatePdfStream(summary: AnalyticsSummary, dynamics: DailyDynamic[], start: Date, end: Date): Readable {
    const doc = new (PDFDocument as any)({ margin: 50, size: 'A4' });
    
    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#1E293B');
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('DSNS Hub Analytics Report', 0, 25, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Period: ${start.toISOString().split('T')[0]} - ${end.toISOString().split('T')[0]}`, 0, 50, { align: 'center' });
    
    doc.y = 100;
    doc.fillColor('#333333');

    // Summary Section
    doc.fontSize(16).font('Helvetica-Bold').text('General Summary');
    doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica');
    const drawSummaryBox = (title: string, data: string, boxX: number, boxY: number) => {
      doc.rect(boxX, boxY, 110, 60).lineWidth(1).strokeColor('#E2E8F0').stroke();
      doc.fillColor('#64748B').fontSize(9).text(title, boxX + 5, boxY + 5, { width: 100, align: 'center' });
      doc.fillColor('#0F172A').fontSize(10).text(data, boxX + 5, boxY + 20, { width: 100, align: 'center' });
    };

    const sumY = doc.y;
    drawSummaryBox('Users', `Total: ${summary.users.total}\nActive: ${summary.users.active}\nAdmins: ${summary.users.admins}`, 50, sumY);
    drawSummaryBox('Projects', `Total: ${summary.projects.total}\nDrafts: ${summary.projects.draft}\nPublished: ${summary.projects.published}`, 170, sumY);
    drawSummaryBox('News', `Total: ${summary.news.total}\nDrafts: ${summary.news.draft}\nPublished: ${summary.news.published}`, 290, sumY);
    drawSummaryBox('Polls', `Total: ${summary.polls.total}\nActive: ${summary.polls.active}\nVotes: ${summary.polls.totalVotes}`, 410, sumY);

    doc.y = sumY + 80;

    // Dynamics Chart Section
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#333333').text('Activity Dynamics');
    this.drawLineChart(doc, dynamics, 50, doc.y + 10, 470, 120);
    
    doc.y += 180; // Move below chart

    // Table Section
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#333333').text('Detailed Daily Metrics');
    doc.moveDown(1);

    // Table Configuration
    const startX = 50;
    const endX = 520; 
    const colX = [startX + 5, 120, 180, 260, 350, 450]; 
    const colWidth = [60, 50, 70, 80, 90, 65];
    const rowHeight = 22;
    let currentY = doc.y;

    const drawRowLine = (y: number) => {
      doc.moveTo(startX, y).lineTo(endX, y).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
    };

    // Table Header
    doc.rect(startX, currentY, endX - startX, rowHeight).fill('#F1F5F9');
    drawRowLine(currentY);
    
    const textYOffset = 6;
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
    doc.text('Date', colX[0], currentY + textYOffset, { width: colWidth[0], align: 'left' });
    doc.text('Users', colX[1], currentY + textYOffset, { width: colWidth[1], align: 'center' });
    doc.text('Projects', colX[2], currentY + textYOffset, { width: colWidth[2], align: 'center' });
    doc.text('Poll Votes', colX[3], currentY + textYOffset, { width: colWidth[3], align: 'center' });
    doc.text('Engagements', colX[4], currentY + textYOffset, { width: colWidth[4], align: 'center' });
    doc.text('Comments', colX[5], currentY + textYOffset, { width: colWidth[5], align: 'center' });
    
    currentY += rowHeight;
    drawRowLine(currentY);

    // Table Rows
    doc.font('Helvetica');

    dynamics.forEach((row, index) => {
      if (currentY + rowHeight > 750) {
        doc.addPage();
        currentY = 50;
        drawRowLine(currentY);
      }

      if (index % 2 === 0) {
        doc.rect(startX, currentY, endX - startX, rowHeight).fill('#F8FAFC');
      }

      doc.fillColor('#0F172A').fontSize(9);
      doc.text(row.date, colX[0], currentY + textYOffset, { width: colWidth[0], align: 'left' });
      doc.text(row.newUsers.toString(), colX[1], currentY + textYOffset, { width: colWidth[1], align: 'center' });
      doc.text(row.newProjects.toString(), colX[2], currentY + textYOffset, { width: colWidth[2], align: 'center' });
      doc.text(row.votes.toString(), colX[3], currentY + textYOffset, { width: colWidth[3], align: 'center' });
      doc.text(row.engagements.toString(), colX[4], currentY + textYOffset, { width: colWidth[4], align: 'center' });
      doc.text(row.comments.toString(), colX[5], currentY + textYOffset, { width: colWidth[5], align: 'center' });
      
      currentY += rowHeight;
      drawRowLine(currentY);
    });

    doc.end();
    return doc;
  }
}