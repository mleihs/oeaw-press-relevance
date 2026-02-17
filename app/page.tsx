'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PressScoreBadge } from '@/components/score-bar';
import { PublicationStats, Publication } from '@/lib/types';
import { getApiHeaders } from '@/lib/settings-store';
import { Upload, Sparkles, BookOpen, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<PublicationStats | null>(null);
  const [topPubs, setTopPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const headers = getApiHeaders();

        const statsRes = await fetch('/api/publications?stats=true', { headers });
        if (!statsRes.ok) throw new Error('Failed to load stats');
        const statsData = await statsRes.json();
        setStats(statsData);

        const topRes = await fetch('/api/publications?sort=press_score&order=desc&pageSize=10&analysis_status=analyzed', { headers });
        if (topRes.ok) {
          const topData = await topRes.json();
          setTopPubs(topData.publications || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-neutral-800 rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="flex items-center gap-3 p-6">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="font-medium text-red-800">Connection Error</p>
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-sm text-neutral-500 mt-1">
              Check your Supabase configuration in <Link href="/settings" className="underline">Settings</Link>.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-neutral-500">OeAW Press Relevance Analyzer</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Publications"
          value={stats?.total || 0}
          icon={BookOpen}
        />
        <StatCard
          title="Enriched"
          value={stats?.enriched || 0}
          icon={Sparkles}
          subtitle={stats?.total ? `${Math.round((stats.enriched / stats.total) * 100)}%` : undefined}
        />
        <StatCard
          title="Analyzed"
          value={stats?.analyzed || 0}
          icon={BarChart3}
          subtitle={stats?.total ? `${Math.round((stats.analyzed / stats.total) * 100)}%` : undefined}
        />
        <StatCard
          title="High Potential"
          value={stats?.high_score_count || 0}
          icon={TrendingUp}
          subtitle={stats?.avg_score !== null && stats?.avg_score !== undefined ? `Avg: ${Math.round(stats.avg_score * 100)}%` : undefined}
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/publications">
              <BookOpen className="mr-2 h-4 w-4" />
              Browse Publications
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/analysis">
              <Sparkles className="mr-2 h-4 w-4" />
              View Analysis
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Top publications */}
      {topPubs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Press-Worthy Publications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPubs.map((pub, i) => (
                <div
                  key={pub.id}
                  className="flex items-start gap-3 rounded-lg p-3 hover:bg-neutral-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{pub.title}</p>
                    <p className="text-xs text-neutral-500 truncate">
                      {pub.authors || 'Unknown'} {pub.institute ? `| ${pub.institute}` : ''}
                    </p>
                    {pub.pitch_suggestion && (
                      <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                        {pub.pitch_suggestion}
                      </p>
                    )}
                  </div>
                  <PressScoreBadge score={pub.press_score} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.total === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="h-12 w-12 text-neutral-300 mb-4" />
            <h3 className="font-medium text-lg mb-1">No publications yet</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Upload a CSV file to get started with press relevance analysis.
            </p>
            <Button asChild>
              <Link href="/upload">Upload CSV</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-500">{title}</p>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
          </div>
          <Icon className="h-8 w-8 text-neutral-200" />
        </div>
      </CardContent>
    </Card>
  );
}
