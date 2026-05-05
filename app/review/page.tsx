'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Publication } from '@/lib/types';
import { useApiQuery } from '@/lib/use-api-query';
import { getApiHeaders } from '@/lib/settings-store';
import { loadCurrentSessionId, clearCurrentSessionId } from '@/lib/session-store';
import { PublicationTable } from '@/components/publication-table';
import { LoadingState } from '@/components/loading-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ClipboardCheck, Pin, Crown, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

interface QueueResponse {
  publications: Publication[];
  since_ts: string;
  counts: { total: number; flagged: number; mahl: number; fresh: number };
}

const REVIEW_QUEUE_KEY = 'review-queue';

export default function ReviewPage() {
  const [finishOpen, setFinishOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useApiQuery<QueueResponse>(
    [REVIEW_QUEUE_KEY],
    '/api/review/queue',
  );

  // The DecisionToolbar invalidates ['review-queue'] on success, so the row
  // disappears via refetch. No per-row animation yet (kept simple for MVP).
  const handleDecided = () => {};

  if (isLoading) {
    return <LoadingState label="Lade Sitzungs-Queue …" />;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card className="border-red-200">
          <CardContent className="p-6">
            <p className="text-red-600">Fehler beim Laden: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pubs = data?.publications ?? [];
  const counts = data?.counts ?? { total: 0, flagged: 0, mahl: 0, fresh: 0 };
  const sinceLabel = data?.since_ts
    ? new Date(data.since_ts).toLocaleString('de-AT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '–';
  const hasActiveSession = typeof window !== 'undefined' && !!loadCurrentSessionId();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            Triage-Sitzung
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            {pubs.length} Publikation{pubs.length === 1 ? '' : 'en'} offen ·
            seit {sinceLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFinishOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Sitzung abschließen
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CountCard
          icon={<Pin className="h-4 w-4 text-amber-500" />}
          label="Geflaggt"
          count={counts.flagged}
          tone="amber"
        />
        <CountCard
          icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
          label={`Frisch (Score ≥ 70%)`}
          count={counts.fresh}
          tone="emerald"
        />
        <CountCard
          icon={<Crown className="h-4 w-4 text-blue-600" />}
          label="ÖAW-Highlights"
          count={counts.mahl}
          tone="blue"
        />
      </div>

      {pubs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-lg font-medium">Queue leer</h2>
            <p className="text-sm text-neutral-500 mt-2">
              Keine offenen Publikationen für die Sitzung. Flag eine Publikation
              auf <Link href="/publications" className="text-brand hover:underline">/publikationen</Link>,
              um sie hier hinzuzufügen — oder warte, bis frisch analysierte Pubs eintreffen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PublicationTable
          publications={pubs}
          showScores
          showEnrichment
          inSession
          onDecided={handleDecided}
        />
      )}

      <FinishSessionDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        onFinished={() => {
          queryClient.invalidateQueries({ queryKey: [REVIEW_QUEUE_KEY] });
        }}
      />
    </div>
  );
}

function CountCard({
  icon, label, count, tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: 'amber' | 'emerald' | 'blue';
}) {
  const ringClass = {
    amber: 'border-amber-200 bg-amber-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    blue: 'border-blue-200 bg-blue-50/40',
  }[tone];
  return (
    <Card className={`border ${ringClass}`}>
      <CardContent className="p-3 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{count}</p>
        </div>
      </CardContent>
    </Card>
  );
}

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
            <label className="text-xs font-medium text-neutral-600">
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
            <label className="text-xs font-medium text-neutral-600">
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
            <label className="text-xs font-medium text-neutral-600">Notizen</label>
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
