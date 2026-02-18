'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { PressScoreBadge } from '@/components/score-bar';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { PublicationStats, Publication } from '@/lib/types';
import { getApiHeaders } from '@/lib/settings-store';
import { decodeHtmlTitle } from '@/lib/html-utils';
import { Upload, Sparkles, BookOpen, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type TimePeriod = 'week' | 'month' | 'year' | 'all';

const TIME_TABS: { value: TimePeriod; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
  { value: 'all', label: 'Gesamt' },
];

function getPublishedAfter(period: TimePeriod): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function getTimeRangeLabel(period: TimePeriod): string {
  if (period === 'all') return 'Alle Zeiträume';
  const now = new Date();
  const monthNames = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  if (period === 'week') return `Letzte 7 Tage`;
  if (period === 'month') return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  return `Letztes Jahr`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<PublicationStats | null>(null);
  const [topPubs, setTopPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [topLoading, setTopLoading] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const headers = getApiHeaders();
        const statsRes = await fetch('/api/publications?stats=true', { headers });
        if (!statsRes.ok) throw new Error('Statistiken konnten nicht geladen werden');
        const statsData = await statsRes.json();
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Dashboard konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  useEffect(() => {
    async function loadTop() {
      setTopLoading(true);
      try {
        const headers = getApiHeaders();
        const params = new URLSearchParams({
          sort: 'press_score',
          order: 'desc',
          pageSize: '10',
          analysis_status: 'analyzed',
        });
        const publishedAfter = getPublishedAfter(timePeriod);
        if (publishedAfter) params.set('published_after', publishedAfter);

        const topRes = await fetch(`/api/publications?${params}`, { headers });
        if (topRes.ok) {
          const topData = await topRes.json();
          setTopPubs(topData.publications || []);
        }
      } catch {
        // silently fail for top pubs
      } finally {
        setTopLoading(false);
      }
    }
    loadTop();
  }, [timePeriod]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Image src="/capybara-logo.png" alt="StoryScout" width={80} height={80} className="opacity-50 mix-blend-multiply" />
        <p className="text-sm text-neutral-500">Lade Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="flex items-center gap-3 p-6">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="font-medium text-red-800">Verbindungsfehler</p>
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-sm text-neutral-500 mt-1">
              Prüfen Sie die Supabase-Konfiguration in den <Link href="/settings" className="underline text-[#0047bb]">Einstellungen</Link>.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-center gap-5">
        <Image
          src="/capybara-logo.png"
          alt="StoryScout Capybara"
          width={160}
          height={160}
          className="shrink-0 mix-blend-multiply"
          priority
        />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">StoryScout</h1>
          <p className="text-neutral-500 mt-1">
            Finde die besten Stories in ÖAW-Publikationen
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Publikationen gesamt"
          value={stats?.total || 0}
          icon={BookOpen}
        />
        <StatCard
          title="Angereichert"
          value={(stats?.enriched || 0) + (stats?.partial || 0)}
          icon={Sparkles}
          subtitle={
            stats?.with_abstract
              ? `${stats.with_abstract} mit Abstract${stats.partial ? ` | ${stats.partial} teilweise` : ''}`
              : stats?.total
                ? `${Math.round(((stats.enriched + (stats.partial || 0)) / stats.total) * 100)}%`
                : undefined
          }
        />
        <StatCard
          title="Analysiert"
          value={stats?.analyzed || 0}
          icon={BarChart3}
          subtitle={stats?.total ? `${Math.round((stats.analyzed / stats.total) * 100)}%` : undefined}
        />
        <StatCard
          title="Hohes Story-Potenzial"
          value={stats?.high_score_count || 0}
          icon={TrendingUp}
          subtitle={stats?.avg_score !== null && stats?.avg_score !== undefined ? `Durchschnitt: ${Math.round(stats.avg_score * 100)}%` : undefined}
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/upload">
              <Upload className="mr-2 h-4 w-4" />
              CSV importieren
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/publications">
              <BookOpen className="mr-2 h-4 w-4" />
              Publikationen durchsuchen
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/analysis">
              <Sparkles className="mr-2 h-4 w-4" />
              Analyse anzeigen
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Top publications with time filter */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Top 10 Publikationen</CardTitle>
            <p className="text-xs text-neutral-500 mt-1">{getTimeRangeLabel(timePeriod)}</p>
          </div>
          <div className="flex rounded-lg border bg-neutral-50 p-0.5">
            {TIME_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setTimePeriod(tab.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  timePeriod === tab.value
                    ? 'bg-[#0047bb] text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-neutral-200 border-t-[#0047bb] rounded-full" />
            </div>
          ) : topPubs.length > 0 ? (
            <div className="space-y-2">
              {topPubs.map((pub, i) => (
                <Link
                  key={pub.id}
                  href={`/publications/${pub.id}`}
                  className="flex items-start gap-3 rounded-lg p-3 hover:bg-neutral-50 transition-colors group"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0047bb] text-white text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-[#0047bb]">
                      {decodeHtmlTitle(pub.title)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-neutral-500 truncate">
                        {pub.authors || 'Unbekannt'} {pub.institute ? `| ${pub.institute}` : ''}
                      </p>
                      {pub.publication_type && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pub.publication_type}</Badge>
                      )}
                      {pub.published_at && (
                        <span className="text-[10px] text-neutral-400">{pub.published_at.slice(0, 4)}</span>
                      )}
                    </div>
                    {pub.pitch_suggestion && (
                      <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                        {pub.pitch_suggestion}
                      </p>
                    )}
                  </div>
                  <PressScoreBadge score={pub.press_score} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-neutral-500">
              Keine analysierten Publikationen in diesem Zeitraum.
            </div>
          )}
        </CardContent>
      </Card>

      {stats?.total === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <CapybaraEmpty
              message="Noch keine Publikationen"
              submessage="Laden Sie eine CSV-Datei hoch, um mit StoryScout zu starten."
            />
            <div className="flex justify-center mt-4">
              <Button asChild>
                <Link href="/upload">CSV importieren</Link>
              </Button>
            </div>
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
          <Icon className="h-8 w-8 text-[#0047bb]/20" />
        </div>
      </CardContent>
    </Card>
  );
}
