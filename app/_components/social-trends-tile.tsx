'use client';

// Social-Media-Trends-Kachel des Dashboards (Design Toolkit-Redesign
// §Dashboard 2026-07-06) samt Delta-Chip, Theme-Sparkline und Lagebild-Panel.
// Aus dashboard-client.tsx extrahiert (Muster: scoring-status-tile.tsx) —
// mechanisch, Verhalten/Markup 1:1.
import Link from 'next/link';
import {
  ArrowRight,
  Heart,
  InstagramLogo,
  MessageCircle,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from '@/lib/icons';
import { socialAccent } from '@/app/social/_components/social-accents';
import type { SocialDashboardData, SocialDashboardTheme } from '@/lib/server/social/dashboard';
import { InfoBubble } from '@/components/info-bubble';
import { formatCompact } from '@/lib/shared/format-compact';
import { CARD } from './dashboard-card';

function DeltaChip({ pct, small }: { pct: number | null; small?: boolean }) {
  // pct === null = kein tragfähiger Bezugswert (in der älteren Fensterhälfte
  // lagen keine oder fast keine Likes) → NICHT „unverändert" (das wäre +0 %).
  // Neutrales „neu"-Chip statt Leerstelle, damit es nicht wie ±0 aussieht;
  // Tooltip erklärt den Grund. Die Schwelle steckt in momentumPct.
  if (pct === null) {
    return (
      <span
        title="Kein belastbarer Vergleichswert: in der älteren Hälfte des Zeitraums gab es kaum Likes (frisches Thema)."
        className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-fill font-mono font-medium text-ink-muted ${
          small ? 'px-[7px] py-0.5 text-2xs' : 'px-2 py-[3px] text-2xs'
        }`}
      >
        neu
      </span>
    );
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-semibold ${
        small ? 'px-[7px] py-0.5 text-2xs' : 'px-2 py-[3px] text-2xs'
      } ${up ? 'bg-success-tint text-success' : 'bg-danger-tint text-destructive'}`}
    >
      <Icon weight="bold" className="h-3 w-3" />
      {up ? '+' : ''}
      {pct} %
    </span>
  );
}

function ThemeSparkline({ theme }: { theme: SocialDashboardTheme }) {
  const accent = socialAccent(theme.accent_index);
  const max = Math.max(1, ...theme.spark);
  return (
    <span aria-hidden className="flex h-[22px] shrink-0 items-end gap-0.5">
      {theme.spark.map((v, i) => (
        <span
          key={i}
          className={`block w-1 rounded-[2px] ${accent.dot}`}
          style={{
            height: `${Math.max(2, Math.round((v / max) * 22))}px`,
            opacity: 0.35 + 0.65 * (i / (theme.spark.length - 1)),
          }}
        />
      ))}
    </span>
  );
}

export function SocialTrendsTile({ data, fullWidth }: { data: SocialDashboardData; fullWidth?: boolean }) {
  const topAccent = data.top_post ? socialAccent(data.top_post.accent_index) : null;
  // Voll-Breite (kein angemeldeter ÖAW-Nutzer → keine Board-Kachel daneben) +
  // vorhandenes Lagebild → die rechte Hälfte trägt das KI-Narrativ statt Luft.
  const showBriefing = !!fullWidth && !!data.narrative;

  const themesBlock = (
    <div className="flex-1 px-2.5 pb-1 pt-2">
      <div className="px-1.5 pb-[7px] pt-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-ink-muted">
        Trend-Themen
      </div>
      {/* Alle Themen mit internem Scrollbalken (wie die Kanäle im Board):
          max-Höhe deckelt die Kachel, die Liste scrollt darin. */}
      <div className={showBriefing ? 'max-h-[248px] overflow-y-auto' : 'max-h-[196px] overflow-y-auto'}>
        {data.themes.map((t) => {
          const accent = socialAccent(t.accent_index);
          return (
            <Link
              key={t.name}
              // Deep-Link auf das Thema (per Name; /social löst ihn auf den
              // Theme-Index auf und scrollt/fokussiert die Gruppe).
              href={`/social?theme=${encodeURIComponent(t.name)}`}
              className="flex items-center gap-[11px] rounded-[10px] px-1.5 py-2 transition-colors hover:bg-canvas"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${accent.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{t.name}</div>
                <div className="mt-px font-mono text-2xs text-ink-muted">
                  {t.post_count} {t.post_count === 1 ? 'Post' : 'Posts'} · {formatCompact(t.likes)} Likes
                </div>
              </div>
              <ThemeSparkline theme={t} />
              <DeltaChip pct={t.delta_pct} small />
            </Link>
          );
        })}
      </div>
    </div>
  );

  const topPostBlock = data.top_post && (
    <div className="mx-2.5 mb-2.5 border-t border-line pt-2">
      <div className="px-1.5 pb-1.5 font-mono text-3xs font-semibold uppercase tracking-wider text-ink-muted">
        Stärkster Post
      </div>
      <Link
        href="/social"
        className="flex items-center gap-[11px] rounded-[10px] px-1.5 py-2 transition-colors hover:bg-canvas"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${topAccent?.avatar ?? 'bg-brand'}`}
        >
          <InstagramLogo weight="fill" className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-[1.3] text-ink">
            {data.top_post.topic}
          </div>
          <div className="mt-0.5 font-mono text-2xs text-ink-muted">
            {data.top_post.handle}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#e1306c]">
            <Heart weight="fill" className="h-[13px] w-[13px]" />
            {formatCompact(data.top_post.likes)}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-2xs text-ink-muted">
            <MessageCircle className="h-[11px] w-[11px]" />
            {data.top_post.comments.toLocaleString('de-AT')}
          </span>
        </div>
      </Link>
    </div>
  );

  return (
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-[11px] border-b border-line bg-[linear-gradient(120deg,#fbf1ff,#eef4ff_52%,#eafaf4)] px-4 pb-[13px] pt-[15px] dark:bg-none">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7a3ab4,#c13584_52%,#f0842e)] text-white shadow-[0_3px_10px_rgba(193,53,132,.32)]">
          <InstagramLogo weight="fill" className="h-[19px] w-[19px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-ink">Social-Media-Trends</div>
          <div className="mt-px font-mono text-2xs text-[#9a7fb5]">
            Instagram · {data.channel_count} Kanäle · {data.window_days} Tage
          </div>
        </div>
        <DeltaChip pct={data.delta_pct} />
        <InfoBubble id="social_momentum" size="sm" />
      </div>

      {showBriefing ? (
        // Voll-Breite: links Themen/Top-Post, rechts das Lagebild-Panel.
        <div className="grid flex-1 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col lg:border-r lg:border-line">
            {themesBlock}
            {topPostBlock}
          </div>
          <BriefingPanel narrative={data.narrative!} channelCount={data.channel_count} windowDays={data.window_days} />
        </div>
      ) : (
        <>
          {themesBlock}
          {topPostBlock}
        </>
      )}

      <Link
        href="/social"
        className="flex items-center gap-1.5 border-t border-line px-4 py-3 text-xs font-semibold text-brand transition-colors hover:bg-canvas"
      >
        Zum Social-Media-Lagebild
        <span className="flex-1" />
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Rechte Hälfte der Voll-Breite-Kachel: das KI-Lagebild grafisch ausgespielt
 *  (Gradient + Sparkle wie die /social-Briefing-Karte, hier als hohes Panel).
 *  Deckt sich in Begriff und Optik mit dem „Lagebild" auf /social. */
function BriefingPanel({
  narrative,
  channelCount,
  windowDays,
}: {
  narrative: string;
  channelCount: number;
  windowDays: number;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-3 overflow-hidden border-t border-line bg-gradient-to-br from-brand-50 to-surface-muted p-5 lg:border-t-0 dark:from-brand-500/10 dark:to-transparent">
      {/* Dekoratives, stark abgeblendetes Sparkle als Flächen-Akzent. */}
      <Sparkles
        aria-hidden
        weight="fill"
        className="pointer-events-none absolute -right-5 -top-5 h-28 w-28 text-brand-500/[0.07] dark:text-brand-300/[0.06]"
      />
      <div className="relative flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-500 text-white shadow-[0_4px_12px_rgba(0,71,187,.28)]"
        >
          <Sparkles className="h-4 w-4" weight="fill" />
        </span>
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-brand-700 dark:text-brand-300">
          Lagebild
          <span className="rounded-full bg-surface px-2 py-px font-mono text-2xs font-medium text-brand-400 dark:bg-brand-500/15 dark:text-brand-300">
            KI-Zusammenfassung
          </span>
        </p>
      </div>
      <p className="relative text-sm leading-relaxed text-foreground/90">{narrative}</p>
      <div className="relative mt-auto pt-1 font-mono text-2xs text-ink-muted">
        {channelCount} Kanäle · {windowDays} Tage
      </div>
    </div>
  );
}
