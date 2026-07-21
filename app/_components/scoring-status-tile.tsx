'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoBubble } from '@/components/info-bubble';
import { ScoringModal } from '@/components/scoring-modal';
import { SCORING_STALE_DANGER_DAYS } from '@/lib/shared/dashboard';
import { cn } from '@/lib/shared/utils';
import { Brain, Newspaper, CalendarDays, AlarmClock, Check, AlertCircle } from '@/lib/icons';
import type { EntityScoringStatus, ScoringStatus } from '@/lib/server/ingest/status';

// Kartengrund wie die übrigen Dashboard-Panels (Design System §5, Elevation-1).
const CARD =
  'rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,46,.05)]';

type Entity = 'publications' | 'events';
type Tone = 'success' | 'warning' | 'danger';

// Ampel und Zahl rechnen ausschließlich mit den FRISCHEN Kandidaten (Fenster
// SCORING_RECENT_DAYS) — der Menge, die der Bewerten-Knopf auch erreicht. Der
// Altbestand steht daneben, aber ohne Alarm: er ist Aufgabe des In-Chat-
// Scorings, und eine Kachel, die deshalb dauerhaft rot leuchtet, warnt nicht,
// sie stumpft ab.
function toneFor(s: EntityScoringStatus): Tone {
  if (s.unscoredCount === 0) return 'success';
  if (s.oldestUnscoredDays != null && s.oldestUnscoredDays >= SCORING_STALE_DANGER_DAYS) {
    return 'danger';
  }
  return 'warning';
}

const TONE_PILL: Record<Tone, string> = {
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-destructive',
};

/** Gemeinsame Kachel-Grammatik + zwei Entitäts-Zeilen. `variant` steuert nur, ob
 *  in der Board-Mobile-Spalte (kompakter) oder Desktop gerendert wird — Inhalt
 *  identisch, damit die Kachel in beiden Layern „aus einem Guss" ist. */
export function ScoringStatusTile({ status }: { status: ScoringStatus }) {
  const [openEntity, setOpenEntity] = useState<Entity | null>(null);

  const totalUnscored = status.publications.unscoredCount + status.events.unscoredCount;
  const anyDanger =
    toneFor(status.publications) === 'danger' || toneFor(status.events) === 'danger';

  return (
    <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
      {/* Getinteter Kopf mit 34px-Icon-Quadrat (Brand-Blau, vgl. BoardTile-Amber) */}
      <div className="flex items-center gap-[11px] border-b border-line bg-gradient-to-br from-brand-50 to-surface-muted px-4 pb-[13px] pt-[15px] dark:from-brand-500/10 dark:to-transparent">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand-500 text-white shadow-[0_3px_10px_rgba(0,71,187,.28)]">
          <Brain className="h-[19px] w-[19px]" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-bold tracking-tight text-ink">
            Bewertung
            <InfoBubble id="scoring_status" size="sm" />
          </div>
          <div className="mt-px font-mono text-2xs text-ink-soft">
            Import täglich 06:00 · Scoring bei Bedarf
          </div>
        </div>
        {totalUnscored > 0 && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] font-mono text-2xs font-semibold',
              anyDanger ? 'bg-danger-tint text-destructive' : 'bg-warning-tint text-warning',
            )}
          >
            {anyDanger && <AlarmClock weight="bold" className="h-3 w-3" />}
            {totalUnscored} unbewertet
          </span>
        )}
      </div>

      <div className="flex flex-col divide-y divide-line/60">
        <EntityRow
          label="Publikationen"
          icon={<Newspaper className="h-4 w-4" weight="duotone" />}
          status={status.publications}
          onScore={() => setOpenEntity('publications')}
        />
        <EntityRow
          label="Events"
          icon={<CalendarDays className="h-4 w-4" weight="duotone" />}
          status={status.events}
          onScore={() => setOpenEntity('events')}
        />
      </div>

      <ScoringModal
        entity="publications"
        open={openEntity === 'publications'}
        onOpenChange={(o) => setOpenEntity(o ? 'publications' : null)}
      />
      <ScoringModal
        entity="events"
        open={openEntity === 'events'}
        onOpenChange={(o) => setOpenEntity(o ? 'events' : null)}
      />
    </div>
  );
}

function EntityRow({
  label,
  icon,
  status,
  onScore,
}: {
  label: string;
  icon: React.ReactNode;
  status: EntityScoringStatus;
  onScore: () => void;
}) {
  const tone = toneFor(status);
  const stale =
    tone === 'danger' && status.oldestUnscoredDays != null
      ? ` · älteste ${status.oldestUnscoredDays} T`
      : '';

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-fill text-ink-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{label}</div>
        <div className="mt-0.5 font-mono text-2xs text-ink-soft">
          {status.lastImportAt ? `zuletzt importiert ${status.lastImportAt}` : 'noch nicht importiert'}
          {status.backlogCount > 0 && ` · + ${status.backlogCount} Altbestand (nur In-Chat)`}
        </div>
        {status.lastImportFailed && (
          <div className="mt-0.5 flex items-center gap-1 text-2xs font-medium text-destructive">
            <AlertCircle weight="fill" className="h-3 w-3 shrink-0" />
            Letzter Import fehlgeschlagen
          </div>
        )}
      </div>

      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-mono text-2xs font-semibold',
          TONE_PILL[tone],
        )}
      >
        {tone === 'success' ? (
          <>
            <Check weight="bold" className="h-3 w-3" /> alles bewertet
          </>
        ) : (
          <>
            {tone === 'danger' && <AlarmClock weight="bold" className="h-3 w-3" />}
            {status.unscoredCount} unbewertet{stale}
          </>
        )}
      </span>

      <Button
        size="sm"
        variant="outline"
        disabled={status.unscoredCount === 0}
        onClick={onScore}
        title={
          status.unscoredCount > 0
            ? 'Über OpenRouter bewerten (Fallback)'
            : status.backlogCount > 0
              ? 'Nichts Neues zu bewerten. Der Altbestand läuft über das In-Chat-Scoring.'
              : 'Nichts zu bewerten'
        }
      >
        Bewerten
      </Button>
    </div>
  );
}
