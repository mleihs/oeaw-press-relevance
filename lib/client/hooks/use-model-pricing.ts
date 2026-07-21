'use client';

import { useMemo } from 'react';
import { useApiQuery } from './use-api-query';
import { LLM_MODELS, type ModelPricing } from '@/lib/shared/constants';
import type { ModelPickerResponse } from '@/lib/shared/types';

const FALLBACK_PRICING: Record<string, ModelPricing> = Object.fromEntries(
  LLM_MODELS.map((m) => [m.value, m.fallbackPricing]),
);

/**
 * Aktuelle OpenRouter-Preise für den Modell-Picker, keyed nach Modell-Value.
 *
 * Geteilt von components/scoring-modal.tsx und app/social/_components/
 * refresh-button.tsx, damit beide Picker dieselbe Zahl zeigen. Die Query läuft
 * erst, wenn ein Picker sichtbar ist (`enabled`), und der React-Query-Cache
 * hält sie danach für die Sitzung: mehrfaches Öffnen des Modals löst KEINEN
 * weiteren Fetch aus, serverseitig deckelt der 24-h-Cache in
 * lib/server/llm-pricing.ts den Rest.
 *
 * Vor der Antwort und bei jedem Fehler kommen die statischen Fallback-Preise
 * zurück — die Anzeige ist nie leer und blockiert nie den Start eines Laufs.
 */
export function useModelPricing(enabled: boolean): Record<string, ModelPricing> {
  const { data } = useApiQuery<ModelPickerResponse>(['llm-models'], '/api/llm/models', {
    enabled,
    // Der Server cached ohnehin 24 h; das hier verhindert nur zusätzliches
    // Refetchen innerhalb einer Sitzung.
    staleTime: 60 * 60 * 1000,
    keepPreviousData: false,
  });

  return useMemo(() => {
    if (!data?.models) return FALLBACK_PRICING;
    return Object.fromEntries(data.models.map((m) => [m.value, m.pricing]));
  }, [data]);
}
