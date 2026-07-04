'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Sparkles } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { EnrichmentModal } from '@/components/enrichment-modal';
import { AnalysisModal } from '@/components/analysis-modal';

// Triggers the two batch ETL pipelines (enrichment + analyse) the press
// editorial team runs from this page. Rendered as a compact button cluster in
// the page header (Toolkit-Redesign-Comp: header → filter → list, keine großen
// Panels), statt der früheren zwei Karten. Die Modals sind bestehende
// kontrollierte Dialoge; `router.refresh()` erzwingt einen Server-Re-Fetch der
// Liste für die RSC-Seite.
export function PipelineActions() {
  const router = useRouter();
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const refetch = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setEnrichOpen(true)}
          size="sm"
          variant="outline"
          title="Metadaten aus CrossRef + OpenAlex anreichern"
        >
          <Sparkles className="h-4 w-4" />
          Anreichern
        </Button>
        <Button
          onClick={() => setAnalysisOpen(true)}
          size="sm"
          variant="outline"
          title="LLM-Bewertung über OpenRouter"
        >
          <Brain className="h-4 w-4" />
          Analysieren
        </Button>
      </div>
      <EnrichmentModal
        open={enrichOpen}
        onOpenChange={setEnrichOpen}
        onComplete={refetch}
      />
      <AnalysisModal
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        onComplete={refetch}
      />
    </>
  );
}
