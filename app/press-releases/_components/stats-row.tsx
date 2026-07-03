import { Layers, Link2, FileQuestion, CalendarDays } from '@/lib/icons';
import { StatCard } from '@/components/stat-card';
import type { PressReleasesStats } from '@/lib/server/press-releases/list';

/**
 * Four-up stat-card row. `animate={false}` skips the mount-fade-in motion
 * wrapper inside `StatCard`: on an RSC list page the data is present from
 * first paint, the animation adds nothing but a hydration roundtrip per
 * card. Static, server-friendly rendering.
 */
export function PressReleasesStatsRow({ stats }: { stats: PressReleasesStats }) {
  const matchedPct =
    stats.total > 0
      ? `${Math.round((stats.matched / stats.total) * 100)}% aller PRs`
      : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Layers className="h-5 w-5" />}
        label="Pressemitteilungen gesamt"
        explId="pr_stat_total"
        value={stats.total}
        accent="brand"
        animate={false}
      />
      <StatCard
        icon={<Link2 className="h-5 w-5" />}
        label="Mit Publikations-Match"
        explId="pr_stat_matched"
        value={stats.matched}
        accent="emerald"
        subtitle={matchedPct}
        animate={false}
      />
      <StatCard
        icon={<FileQuestion className="h-5 w-5" />}
        label="Ohne Pub-Match"
        explId="pr_stat_orphans"
        value={stats.orphans}
        accent="amber"
        subtitle="Paper noch nicht in WebDB"
        animate={false}
      />
      <StatCard
        icon={<CalendarDays className="h-5 w-5" />}
        label="Aktuelles Jahr"
        explId="pr_stat_year"
        value={stats.this_year}
        accent="purple"
        subtitle={`${stats.this_month} diesen Monat`}
        animate={false}
      />
    </div>
  );
}
