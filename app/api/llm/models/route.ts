import { NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { LLM_MODELS } from '@/lib/shared/constants';
import { getLiveModelPricing } from '@/lib/server/llm-pricing';
import type { ModelPickerResponse } from '@/lib/shared/types';

// Der kuratierte Modell-Picker mit LIVE-Preisen (Metadaten aus LLM_MODELS,
// Preise aus lib/server/llm-pricing.ts, 24-h-Prozess-Cache). Konsumenten:
// components/scoring-modal.tsx und app/social/_components/refresh-button.tsx
// über lib/client/hooks/use-model-pricing.ts.
//
// Kein `requireUser` (im Unterschied zu den POST-Scoring-Routen, die Guthaben
// verbrauchen): die Route gibt nur die öffentliche OpenRouter-Preisliste
// weiter, verrät nichts über den Account und stößt nichts an. Hinter dem Gate
// (proxy.ts) liegt sie wie jede andere GET-Route ohnehin.

export const GET = withApiError(async () => {
  const pricing = await getLiveModelPricing();
  const body: ModelPickerResponse = {
    models: LLM_MODELS.map((m) => ({
      value: m.value,
      label: m.label,
      description: m.description,
      tier: m.tier,
      pricing: pricing[m.value] ?? { ...m.fallbackPricing, stale: true },
    })),
  };
  return NextResponse.json(body);
});
