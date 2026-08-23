import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  }>;
  recentActivity: {
    latestUsers: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      createdAt: string;
    }>;
    pendingProjects: Array<{
      id: string;
      title: string;
      authorName: string;
      createdAt: string;
    }>;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardData(): Promise<DashboardAnalyticsResponse> {
    // 1. Fetch Aggregated Summary Data concurrently
    const [
      userStats,
      projectStats,
      newsStats,
      pollStats,
      pollTotalVotes,
      latestUsers,
      pendingProjects,
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
    ]);

    // 2. Process Activity Chart (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const [recentUsers, recentProjects, recentProjectVotes, recentNewsVotes, recentPollVotes] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
      this.prisma.project.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
      this.prisma.projectVote.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
      this.prisma.newsVote.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
      this.prisma.pollVote.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
    ]);

    const activityChart = Array.from({ length: 14 }).map((_, index) => {
      const targetDate = new Date(fourteenDaysAgo);
      targetDate.setDate(targetDate.getDate() + index);
      const dateStr = targetDate.toISOString().split('T')[0];

      const filterByDate = (item: { createdAt: Date }) => item.createdAt.toISOString().split('T')[0] === dateStr;

      return {
        date: dateStr,
        newUsers: recentUsers.filter(filterByDate).length,
        newProjects: recentProjects.filter(filterByDate).length,
        votes: 
          recentProjectVotes.filter(filterByDate).length +
          recentNewsVotes.filter(filterByDate).length +
          recentPollVotes.filter(filterByDate).length,
      };
    });

    // 3. Format Response
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
        pendingProjects: pendingProjects.map((p) => ({
          id: p.id,
          title: p.title,
          authorName: `${p.author.lastName} ${p.author.firstName}`.trim(),
          createdAt: p.createdAt.toISOString(),
        })),
      },
    };
  }
}