'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, RotateCcw, SlidersHorizontal, History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';
import { computeEventScore } from '@/lib/shared/scoring';
import {
  EVENT_SCORE_DIMENSIONS,
  EVENT_SCORE_COLORS,
  EVENT_SCORE_LABELS,
  type EventScoreDimension,
} from '@/lib/shared/constants';
import type { EventScoreWeightEntry, EventScoreWeights } from '@/lib/shared/types';

type Weights = Record<EventScoreDimension, number>;
const DIMS = EVENT_SCORE_DIMENSIONS;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const PRESETS: { label: string; w: Weights }[] = [
  { label: 'Ausgewogen', w: { public_appeal: 35, scientific_significance: 30, reach: 20, timeliness: 15 } },
  { label: 'Publikumsfokus', w: { public_appeal: 55, scientific_significance: 15, reach: 20, timeliness: 10 } },
  { label: 'Wissenschaftsfokus', w: { public_appeal: 20, scientific_significance: 50, reach: 15, timeliness: 15 } },
  { label: 'Aktualitätsfokus', w: { public_appeal: 25, scientific_significance: 20, reach: 20, timeliness: 35 } },
];
const DEFAULTS = PRESETS[0].w;

// Two contrasting illustrative events, so the live preview shows how shifting
// the weights changes which kind of event scores higher.
const SAMPLES: { name: string; dims: Weights }[] = [
  { name: 'Publikumsstarkes Event', dims: { public_appeal: 0.9, scientific_significance: 0.4, reach: 0.75, timeliness: 0.55 } },
  { name: 'Wissenschaftlich starkes Event', dims: { public_appeal: 0.4, scientific_significance: 0.95, reach: 0.5, timeliness: 0.4 } },
];

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const fmtPct = (n: number) => `${Math.round(n)}%`;
const dateFmt = new Intl.DateTimeFormat('de-AT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

interface State {
  current: EventScoreWeightEntry;
  history: EventScoreWeightEntry[];
}

async function fetchState(): Promise<State> {
  const res = await fetch('/api/events/score-weights');
  if (!res.ok) throw new Error('Gewichtung konnte nicht geladen werden');
  return res.json();
}

/** Round a (possibly fractional) distribution to integers that sum to exactly
 *  100 (largest-remainder method). */
function normalizeTo100(raw: Weights): Weights {
  const total = DIMS.reduce((s, d) => s + Math.max(0, raw[d]), 0);
  if (total <= 0) return { ...DEFAULTS };
  const parts = DIMS.map((d) => {
    const v = (Math.max(0, raw[d]) / total) * 100;
    return { d, floor: Math.floor(v), frac: v - Math.floor(v) };
  });
  const out = {} as Weights;
  parts.forEach((p) => (out[p.d] = p.floor));
  let rem = 100 - parts.reduce((s, p) => s + p.floor, 0);
  parts.sort((a, b) => b.frac - a.frac);
  for (let i = 0; rem > 0; i++, rem--) out[parts[i % parts.length].d]++;
  return out;
}

function fromServer(w: EventScoreWeights): Weights {
  return normalizeTo100({
    public_appeal: w.public_appeal * 100,
    scientific_significance: w.scientific_significance * 100,
    reach: w.reach * 100,
    timeliness: w.timeliness * 100,
  });
}

/** A single 100%-bar split into the four dimensions; drag the dividers (or
 *  focus one and use ←/→) to shift weight between neighbours. Always sums to
 *  100, so percentages are exact and predictable. */
function AllocationBar({ value, onChange }: { value: Weights; onChange: (w: Weights) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  const cumBefore = (i: number) => DIMS.slice(0, i).reduce((s, d) => s + value[d], 0);

  const applyBoundary = (i: number, boundaryPct: number) => {
    const before = cumBefore(i);
    const pair = value[DIMS[i]] + value[DIMS[i + 1]];
    const b = Math.round(clamp(boundaryPct, before, before + pair));
    const next = { ...value };
    next[DIMS[i]] = b - before;
    next[DIMS[i + 1]] = pair - (b - before);
    onChange(next);
  };

  const onMove = (i: number, e: React.PointerEvent) => {
    if (drag.current !== i || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    applyBoundary(i, ((e.clientX - rect.left) / rect.width) * 100);
  };

  const onKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = { ...value };
    const a = DIMS[i];
    const b = DIMS[i + 1];
    if (e.key === 'ArrowRight' && next[b] > 0) { next[a]++; next[b]--; }
    if (e.key === 'ArrowLeft' && next[a] > 0) { next[a]--; next[b]++; }
    onChange(next);
  };

  return (
    <div>
      <div ref={barRef} className="relative flex h-10 w-full touch-none overflow-hidden rounded-lg select-none">
        {DIMS.map((d) => (
          <div
            key={d}
            className="flex h-full items-center justify-center transition-[width] duration-150"
            style={{ width: `${value[d]}%`, backgroundColor: EVENT_SCORE_COLORS[d] }}
          >
            {value[d] >= 10 && (
              <span className="text-xs font-bold tabular-nums text-white drop-shadow-sm">{value[d]}%</span>
            )}
          </div>
        ))}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={`Grenze ${EVENT_SCORE_LABELS[DIMS[i]]} / ${EVENT_SCORE_LABELS[DIMS[i + 1]]}`}
            aria-valuenow={value[DIMS[i]]}
            onPointerDown={(e) => {
              drag.current = i;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => onMove(i, e)}
            onPointerUp={(e) => {
              drag.current = null;
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            }}
            onKeyDown={(e) => onKey(i, e)}
            className="absolute top-0 bottom-0 z-10 -ml-2 flex w-4 cursor-ew-resize items-center justify-center focus-visible:outline-none"
            style={{ left: `${cumBefore(i + 1)}%` }}
          >
            <span className="h-6 w-1.5 rounded-full bg-white shadow ring-1 ring-black/15" />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {DIMS.map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: EVENT_SCORE_COLORS[d] }} />
            {EVENT_SCORE_LABELS[d]}
            <span className="font-semibold tabular-nums">{value[d]}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EventWeightsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['event-score-weights'], queryFn: fetchState });

  const [w, setW] = useState<Weights>(DEFAULTS);
  const [note, setNote] = useState<string | null>(null);

  const [seededId, setSeededId] = useState<number | null>(null);
  if (data && data.current.id !== seededId) {
    setSeededId(data.current.id);
    setW(fromServer(data.current));
    setNote(null);
  }

  const normWeights: Weights = {
    public_appeal: w.public_appeal / 100,
    scientific_significance: w.scientific_significance / 100,
    reach: w.reach / 100,
    timeliness: w.timeliness / 100,
  };

  const isDirty =
    !!data && DIMS.some((d) => Math.abs(normWeights[d] - data.current[d]) > 0.005);

  const activePreset = PRESETS.find((p) => DIMS.every((d) => p.w[d] === w[d]));

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/events/score-weights', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...w, note: note ?? activePreset?.label ?? undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json() as Promise<{ recomputed: number }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['event-score-weights'] });
      toast.success(`Gewichtung gespeichert · ${r.recomputed} Events neu berechnet`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground/70" />
          Bewertungsgewichtung für Events
          <InfoBubble
            content={{
              title: 'Bewertungsgewichtung für Events',
              body: (
                <p>
                  Legt fest, wie stark die vier Einzel-Scores einer Veranstaltung in den
                  Gesamt-Relevanzscore eingehen (zusammen immer 100&nbsp;%). Beim Speichern werden{' '}
                  <strong>alle bewerteten Events neu berechnet</strong> und die Einstellung im
                  Verlauf gesichert.
                </p>
              ),
            }}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade …
          </div>
        ) : (
          <>
            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant={activePreset?.label === p.label ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setW({ ...p.w })}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* 100% allocation bar */}
            <AllocationBar value={w} onChange={setW} />

            {/* Live preview */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Vorschau — Gesamtscore zweier Beispiel-Events mit dieser Gewichtung
              </p>
              {SAMPLES.map((s) => {
                const overall = computeEventScore(s.dims, normWeights);
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-52 shrink-0 truncate text-sm">{s.name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-300"
                        style={{ width: `${Math.round(overall * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums">
                      {fmtPct(overall * 100)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Speichern &amp; neu berechnen
              </Button>
              <Button size="sm" variant="outline" onClick={() => setW({ ...DEFAULTS })} disabled={save.isPending}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Standard
              </Button>
              {isDirty && <span className="text-xs text-muted-foreground">Ungespeicherte Änderung</span>}
            </div>

            {/* History timeline */}
            <div className="space-y-2 border-t pt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Verlauf
              </p>
              <ul className="space-y-1.5">
                {data.history.map((h, i) => (
                  <li
                    key={h.id}
                    className={cn('flex items-center gap-3 rounded-md px-2 py-1.5 text-xs', i === 0 && 'bg-muted/50')}
                  >
                    <span className="w-32 shrink-0 text-muted-foreground tabular-nums">
                      {dateFmt.format(new Date(h.created_at))}
                    </span>
                    <span className="flex h-2.5 w-28 shrink-0 overflow-hidden rounded-full">
                      {DIMS.map((d) => (
                        <span key={d} style={{ width: `${h[d] * 100}%`, backgroundColor: EVENT_SCORE_COLORS[d] }} />
                      ))}
                    </span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {DIMS.map((d) => Math.round(h[d] * 100)).join(' / ')}
                      {h.note ? ` · ${h.note}` : ''}
                      {h.recomputed_count != null ? ` · ${h.recomputed_count} Events` : ''}
                    </span>
                    {i === 0 ? (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">aktuell</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setW(fromServer(h));
                          setNote(`Wiederhergestellt vom ${dateFmt.format(new Date(h.created_at))}`);
                          toast.info('Werte übernommen — zum Anwenden „Speichern" klicken');
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-brand/10"
                      >
                        <Undo2 className="h-3 w-3" /> Übernehmen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
