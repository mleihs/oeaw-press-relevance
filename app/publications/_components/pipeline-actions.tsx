'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { ScoringModal } from '@/components/scoring-modal';

// „Bewerten"-Aktion im Seitenkopf der Publikationsliste (Toolkit-Redesign-Comp:
// header → filter → list). Enrichment gibt es hier NICHT mehr als eigenen Knopf:
// es läuft automatisch beim Nacht-Import (lib/server/ingest/run-enrichment.ts) —
// „nur enrichen ohne zu bewerten" ergab keinen Sinn. Bevorzugt bleibt das
// kostenlose In-Chat-Scoring; dieser Button ist der OpenRouter-Fallback.
// `router.refresh()` erzwingt einen Server-Re-Fetch der Liste (RSC-Seite).
export function PipelineActions() {
  const router = useRouter();
  const [scoringOpen, setScoringOpen] = useState(false);
  const refetch = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setScoringOpen(true)}
          size="sm"
          variant="outline"
          title="LLM-Bewertung über OpenRouter (Fallback zum In-Chat-Scoring)"
        >
          <Brain className="h-4 w-4" />
          Bewerten
        </Button>
      </div>
      <ScoringModal
        entity="publications"
        open={scoringOpen}
        onOpenChange={setScoringOpen}
        onComplete={refetch}
      />
    </>
  );
}
