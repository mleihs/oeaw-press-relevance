'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { toast } from 'sonner';
import {
  DECISIONS,
  DECIDED_DECISIONS,
  type Decision,
  type Publication,
  type ReviewSession,
} from '@/lib/shared/types';
import { useApiQuery } from '@/lib/use-api-query';
import { getApiHeaders } from '@/lib/settings-store';
import { loadCurrentSessionId, clearCurrentSessionId } from '@/lib/session-store';
import { PublicationTable } from '@/components/publication-table';
import { ApiErrorCard } from '@/components/api-error-card';
import { ReviewQueueSkeleton } from '@/components/skeletons';
import { DECISION_VARIANTS } from '@/components/decision-badge';
import { QK } from '@/lib/query-keys';
import { InfoBubble } from '@/components/info-bubble';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  ClipboardCheck, Pin, Crown, Sparkles, CheckCircle2, Loader2, Info,
  Calendar as CalendarIcon, Clock, ListChecks,
} from 'lucide-react';
import type { EXPL } from '@/lib/explanations';

type SortMode = 'press_score' | 'combined';

interface QueueResponse {
  publications: Publication[];
  since_ts: string | null;
  sort?: SortMode | 'decided_at';
  counts: { total: number; flagged: number; mahl: number; fresh: number };
  decision_counts: Record<Decision, number>;
}

interface RecentResponse {
  recent: {
    session: ReviewSession;
    counts: { pitch: number; hold: number; skip: number; total: number };
  } | null;
}


export default function ReviewPage() {
  const [finishOpen, setFinishOpen] = useState(false);
  const [decision, setDecision] = useQueryState(
    'decision',
    parseAsStringEnum<Decision>([...DECISIONS]).withDefault('undecided'),
  );
  const [sort, setSort] = useQueryState(
    'sort',
    parseAsStringEnum<SortMode>(['press_score', 'combined']).withDefault('press_score'),
  );
  const queryClient = useQueryClient();

  const queueUrl = (() => {
    const params = new URLSearchParams();
    params.set('decision', decision);
    if (decision === 'undecided' && sort === 'combined') params.set('sort', 'combined');
    return `/api/review/queue?${params}`;
  })();
  const { data, isLoading, error } = useApiQuery<QueueResponse>(
    [...QK.reviewQueue, decision, sort],
    queueUrl,
  );

  const { data: recentData } = useApiQuery<RecentResponse>(
    QK.recentSession,
    '/api/sessions/recent',
  );

  if (isLoading) {
    return <ReviewQueueSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <ApiErrorCard title="Fehler beim Laden" message={error.message} />
      </div>
    );
  }

  const pubs = data?.publications ?? [];
  const counts = data?.counts ?? { total: 0, flagged: 0, mahl: 0, fresh: 0 };
  const decisionCounts =
    data?.decision_counts ??
    (Object.fromEntries(DECISIONS.map((d) => [d, 0])) as Record<Decision, number>);
  const sinceLabel = data?.since_ts
    ? new Date(data.since_ts).toLocaleString('de-AT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '–';
  const hasActiveSession = typeof window !== 'undefined' && !!loadCurrentSessionId();

  return (
    <div className="space-y-5">
      <PageHeader
        decision={decision}
        pubCount={pubs.length}
        sinceLabel={sinceLabel}
        hasActiveSession={hasActiveSession}
        onFinishClick={() => setFinishOpen(true)}
      />

      {decision === 'undecided' && <OnboardingBanner recent={recentData?.recent ?? null} />}

      <Tabs value={decision} onValueChange={(v) => setDecision(v as Decision)}>
        <TabsList className="w-full sm:w-auto">
          {DECISIONS.map((d) => (
            <DecisionTab key={d} value={d} count={decisionCounts[d]} />
          ))}
        </TabsList>
      </Tabs>

      {decision === 'undecided' && (
        <div className="grid grid-cols-3 gap-3">
          <CountCard
            icon={<Pin className="h-4 w-4 text-amber-500" />}
            label="Geflaggt"
            count={counts.flagged}
            tone="amber"
            explId="triage_flagged"
          />
          <CountCard
            icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
            label="Frisch (Score ≥ 70%)"
            count={counts.fresh}
            tone="emerald"
            explId="triage_fresh"
          />
          <CountCard
            icon={<Crown className="h-4 w-4 text-blue-600" />}
            label="ÖAW-Highlights"
            count={counts.mahl}
            tone="blue"
            explId="triage_mahl"
          />
        </div>
      )}

      {pubs.length === 0 ? (
        <EmptyBucket decision={decision} />
      ) : (
        <>
          {decision === 'undecided' && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <TabsList>
                  <TabsTrigger value="press_score" className="gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Score
                  </TabsTrigger>
                  <TabsTrigger value="combined" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Score + Similarity
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                {sort === 'combined'
                  ? 'Rang-Fusion aus Score und SPECTER2-Similarity zur Press-Cluster.'
                  : 'Sortiert nach Press-Score (Default).'}
              </p>
            </div>
          )}

          {decision !== 'undecided' && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Sortiert nach Entscheidungs-Datum (zuletzt entschieden zuerst).
            </p>
          )}

          <PublicationTable
            publications={pubs}
            showScores
            showEnrichment
            inSession={decision === 'undecided'}
            onDecided={() => {}}
          />
        </>
      )}

      <FinishSessionDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        onFinished={() => {
          queryClient.invalidateQueries({ queryKey: QK.reviewQueue });
          queryClient.invalidateQueries({ queryKey: QK.recentSession });
        }}
      />
    </div>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────

const PAGE_TITLES: Record<Decision, { title: string; sub: (n: number, since: string) => string }> = {
  undecided: {
    title: 'Triage-Sitzung',
    sub: (n, since) => `${n} Publikation${n === 1 ? '' : 'en'} offen · seit ${since}`,
  },
  pitch: {
    title: 'Triage · Pitch',
    sub: (n) => `${n} Publikation${n === 1 ? '' : 'en'} zum Pitch entschieden`,
  },
  hold: {
    title: 'Triage · Hold',
    sub: (n) => `${n} Publikation${n === 1 ? '' : 'en'} on Hold`,
  },
  skip: {
    title: 'Triage · Skip',
    sub: (n) => `${n} Publikation${n === 1 ? '' : 'en'} verworfen`,
  },
};

function PageHeader({
  decision,
  pubCount,
  sinceLabel,
  hasActiveSession,
  onFinishClick,
}: {
  decision: Decision;
  pubCount: number;
  sinceLabel: string;
  hasActiveSession: boolean;
  onFinishClick: () => void;
}) {
  const cfg = PAGE_TITLES[decision];
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-brand" />
          {cfg.title}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {cfg.sub(pubCount, sinceLabel)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {hasActiveSession && decision === 'undecided' && (
          <Button variant="outline" size="sm" onClick={onFinishClick}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Sitzung abschließen
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Tab trigger with count badge ───────────────────────────────────────────

function DecisionTab({ value, count }: { value: Decision; count: number }) {
  const config =
    value === 'undecided'
      ? { Icon: ListChecks, label: 'Offen' }
      : { Icon: DECISION_VARIANTS[value].Icon, label: DECISION_VARIANTS[value].label };
  const Icon = config.Icon;
  return (
    <TabsTrigger value={value} className="gap-2">
      <Icon className="h-4 w-4" />
      {config.label}
      <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0 tabular-nums">
        {count}
      </Badge>
    </TabsTrigger>
  );
}

// ─── Empty-state per bucket ─────────────────────────────────────────────────

const EMPTY_COPY: Record<Decision, { title: string; body: React.ReactNode }> = {
  undecided: {
    title: 'Queue leer',
    body: (
      <>
        Keine offenen Publikationen für die Sitzung. Flag eine Publikation auf{' '}
        <Link href="/publications" className="text-brand hover:underline">
          /publikationen
        </Link>
        , um sie hier hinzuzufügen — oder warte, bis frisch analysierte Pubs eintreffen.
      </>
    ),
  },
  pitch: {
    title: 'Noch nichts gepitched',
    body: 'Sobald in der Triage „Pitch" entschieden wird, taucht die Publikation hier auf.',
  },
  hold: {
    title: 'Nichts on Hold',
    body: 'Hold-Pubs erscheinen hier (ggf. mit Snooze-Datum), bis sie wieder aufgenommen werden.',
  },
  skip: {
    title: 'Nichts verworfen',
    body: 'Skip-Pubs werden hier archiviert sichtbar — als Triage-Historie.',
  },
};

function EmptyBucket({ decision }: { decision: Decision }) {
  const c = EMPTY_COPY[decision];
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h2 className="text-lg font-medium">{c.title}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{c.body}</p>
      </CardContent>
    </Card>
  );
}

// ─── Onboarding banner (only on Offen-tab) ──────────────────────────────────

function OnboardingBanner({ recent }: { recent: RecentResponse['recent'] }) {
  return (
    <Card className="bg-gradient-to-br from-brand/[0.04] via-transparent to-purple-500/[0.04] border-brand/20">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand/10 p-2 shrink-0">
            <Info className="h-4 w-4 text-brand" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <h2 className="font-medium text-sm">So funktioniert die Triage-Sitzung</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Die Liste zeigt drei Kategorien zusammen: <strong>geflaggte</strong> Pubs aus dem
                Team, <strong>ÖAW-Highlights</strong> der Institute und <strong>frische
                Pubs</strong> mit hohem Score seit der letzten Sitzung. Pro Pub: Pitch / Hold /
                Skip — sobald entschieden, wandert sie in den entsprechenden Tab oben.
              </p>
            </div>
            {recent && <RecentSessionRecap recent={recent} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentSessionRecap({ recent }: { recent: NonNullable<RecentResponse['recent']> }) {
  const date = new Date(recent.session.occurred_at);
  const dateLabel = date.toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const facilitator = recent.session.facilitator?.trim();

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-border/60">
      <span className="text-muted-foreground">
        Letzte Sitzung am <span className="font-medium text-foreground">{dateLabel}</span>
        {facilitator && <> mit <span className="font-medium text-foreground">{facilitator}</span></>}
        {' '}—
      </span>
      {DECIDED_DECISIONS.map((d) => {
        const v = DECISION_VARIANTS[d];
        const Icon = v.Icon;
        return (
          <span
            key={d}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${v.badgePill}`}
          >
            <Icon className="h-3 w-3" />
            {recent.counts[d]} {v.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Stats cards (Offen-tab only) ───────────────────────────────────────────

function CountCard({
  icon, label, count, tone, explId,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: 'amber' | 'emerald' | 'blue';
  explId?: keyof typeof EXPL;
}) {
  const ringClass = {
    amber: 'border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/[0.06]',
    emerald: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/[0.06]',
    blue: 'border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/[0.06]',
  }[tone];
  return (
    <Card className={`border ${ringClass}`}>
      <CardContent className="p-3 flex items-center gap-3">
        {icon}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            {label}
            {explId && <InfoBubble id={explId} />}
          </p>
          <p className="text-lg font-semibold tabular-nums">{count}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Finish-session dialog ──────────────────────────────────────────────────

function FinishSessionDialog({
  open, onOpenChange, onFinished,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onFinished: () => void;
}) {
  const [attendees, setAttendees] = useState('');
  const [facilitator, setFacilitator] = useState('');
  const [notes, setNotes] = useState('');

  const finish = useMutation({
    mutationFn: async () => {
      const sid = loadCurrentSessionId();
      if (!sid) throw new Error('Keine aktive Sitzung gefunden');
      const r = await fetch(`/api/sessions/${sid}/finish`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          attendees: attendees
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          facilitator: facilitator.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body;
    },
    onSuccess: () => {
      clearCurrentSessionId();
      toast.success('Sitzung abgeschlossen');
      onFinished();
      onOpenChange(false);
      setAttendees('');
      setFacilitator('');
      setNotes('');
    },
    onError: (err: Error) => {
      toast.error(`Fehler: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sitzung abschließen</DialogTitle>
          <DialogDescription>
            Schreibt occurred_at = jetzt, attendees, facilitator und Notizen
            in die review_sessions-Tabelle. Optionalfelder können leer bleiben.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Anwesende (komma-separiert)
            </label>
            <Input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Marie, Stefan, Anna"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Moderation
            </label>
            <Input
              value={facilitator}
              onChange={(e) => setFacilitator(e.target.value)}
              placeholder="Marie"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notizen</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allgemeine Beobachtungen aus der Sitzung …"
              className="mt-1 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => finish.mutate()} disabled={finish.isPending}>
            {finish.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Abschließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
