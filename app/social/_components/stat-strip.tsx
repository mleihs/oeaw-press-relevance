import { FileText, Radio, Layers, CalendarRange } from 'lucide-react';
import { StatCard } from '@/components/stat-card';

/** KPI strip: the at-a-glance overview, placed top where attention lands first
 *  (overview-first). All values numeric. */
export function StatStrip({
  posts,
  channels,
  themes,
  windowDays,
}: {
  posts: number;
  channels: number;
  themes: number;
  windowDays: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Posts im Fenster" value={posts} icon={<FileText className="h-5 w-5" />} accent="brand" />
      <StatCard label="Kanäle" value={channels} icon={<Radio className="h-5 w-5" />} />
      <StatCard label="Themen" value={themes} icon={<Layers className="h-5 w-5" />} accent="purple" />
      <StatCard label="Beobachtung" value={windowDays} subtitle="Tage (Standard)" icon={<CalendarRange className="h-5 w-5" />} accent="amber" />
    </div>
  );
}
