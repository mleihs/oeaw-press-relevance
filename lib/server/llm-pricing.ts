import { LLM_MODELS, type ModelPricing } from '@/lib/shared/constants';
import { log } from '@/lib/server/log';

/**
 * Live-Preise der kuratierten Modelle von OpenRouter.
 *
 * Warum überhaupt live: die Preise im Modell-Picker waren fest verdrahtet und
 * damit systematisch veraltet (Sonnet 4 stand mit einem Mischpreis von $9/M in
 * der Liste, während OpenRouter längst 3|15 auswies). Wer einen Lauf startet,
 * der echtes Guthaben kostet, soll die Zahl sehen, die auch abgerechnet wird.
 *
 * Warum ein Modul-Level-Cache und kein `unstable_cache`/`revalidate`: die App
 * läuft auf ZWEI Zielen (Vercel-Standby und der kanonischen Coolify-Node) und
 * soll sich auf beiden identisch verhalten. Ein schlichter Prozess-Cache tut
 * das; er kostet im schlimmsten Fall einen Fetch je Server-Prozess und Tag.
 *
 * Fail-open ist Pflicht: die Preisanzeige darf niemals einen Bewertungslauf
 * blockieren. Fällt der Fetch aus, liefert die Funktion die statischen
 * Fallback-Preise mit `stale: true`, und der Fehler wird nur geloggt.
 *
 * BEWUSST OHNE `import 'server-only'`: das Modul hält keine Geheimnisse (die
 * OpenRouter-Preisliste ist öffentlich und liegt ohnehin hinter
 * /api/llm/models offen) und braucht keinen API-Key. Der Marker hätte hier
 * nichts geschützt, aber lib/server/openrouter.ts unbrauchbar gemacht, sobald
 * es die Preise für die Kostenrechnung braucht: der zieht auch in
 * tsx-Skripten (scripts/analyze-events.ts), wo `server-only` schlicht nicht
 * auflösbar ist. Das Verzeichnis lib/server signalisiert die Absicht.
 */

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 24 * 60 * 60 * 1000;
/** Nach einem Fehlschlag kurz sperren, damit ein Ausfall nicht jeden Request
 *  in einen 8-Sekunden-Timeout laufen lässt. */
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8_000;

export interface LiveModelPricing extends ModelPricing {
  /** true = Fallback-Wert aus lib/shared/constants.ts, nicht von OpenRouter. */
  stale: boolean;
}

export type ModelPricingMap = Record<string, LiveModelPricing>;

interface CacheEntry {
  at: number;
  ttl: number;
  data: ModelPricingMap;
}

let cache: CacheEntry | null = null;
/** Verhindert, dass parallele Requests denselben Fetch mehrfach auslösen. */
let inflight: Promise<ModelPricingMap> | null = null;

function fallbackMap(): ModelPricingMap {
  return Object.fromEntries(
    LLM_MODELS.map((m) => [m.value, { ...m.fallbackPricing, stale: true }]),
  );
}

/** OpenRouter gibt Preise als $/Token in Stringform aus („0.000005"). */
function perMillion(raw: unknown): number | null {
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

interface OpenRouterModel {
  id?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
}

async function fetchPricing(): Promise<ModelPricingMap> {
  const merged = fallbackMap();
  const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OpenRouter models HTTP ${res.status}`);

  const body = (await res.json()) as { data?: OpenRouterModel[] };
  const wanted = new Set(LLM_MODELS.map((m) => m.value));
  for (const m of body.data ?? []) {
    if (typeof m.id !== 'string' || !wanted.has(m.id)) continue;
    const promptUsd = perMillion(m.pricing?.prompt);
    const completionUsd = perMillion(m.pricing?.completion);
    // Beide Richtungen oder keine: eine halb übernommene Preisangabe wäre
    // irreführender als der bekannte Fallback.
    if (promptUsd === null || completionUsd === null) continue;
    merged[m.id] = { promptUsd, completionUsd, stale: false };
  }
  return merged;
}

export async function getLiveModelPricing(): Promise<ModelPricingMap> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await fetchPricing();
      cache = { at: Date.now(), ttl: TTL_MS, data };
      return data;
    } catch (err) {
      log.warn('OpenRouter-Preisliste nicht abrufbar, nutze Fallback-Preise', { err });
      const data = fallbackMap();
      cache = { at: Date.now(), ttl: NEGATIVE_TTL_MS, data };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Nur für Tests: den Prozess-Cache leeren. */
export function __resetPricingCache(): void {
  cache = null;
  inflight = null;
}
