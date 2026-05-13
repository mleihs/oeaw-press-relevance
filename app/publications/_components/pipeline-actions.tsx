'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EnrichmentModal } from '@/components/enrichment-modal';
import { AnalysisModal } from '@/components/analysis-modal';

// Triggers the two batch ETL pipelines (enrichment + analyse) the press
// editorial team runs from this page. The modals are pre-existing controlled
// dialogs; `router.refresh()` replaces the legacy
// `queryClient.invalidateQueries([PUBS_QUERY_KEY])` invalidation pattern —
// for the RSC page, refreshing forces a server-side re-fetch of the list.
export function PipelineActions() {
  const router = useRouter();
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const refetch = useCallback(() => router.refresh(), [router]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-medium">
                <Sparkles className="h-4 w-4 text-brand" /> Enrichment
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Metadaten aus CrossRef + OpenAlex anreichern.
              </p>
            </div>
            <Button onClick={() => setEnrichOpen(true)} size="sm">
              Starten
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-medium">
                <Brain className="h-4 w-4 text-brand" /> Analyse
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                LLM-Bewertung über OpenRouter.
              </p>
            </div>
            <Button onClick={() => setAnalysisOpen(true)} size="sm">
              Starten
            </Button>
          </CardContent>
        </Card>
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
