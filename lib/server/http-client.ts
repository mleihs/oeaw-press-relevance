// Gemeinsamer HTTP-Helfer für die vier Enrichment-Clients (Architektur-Audit
// #11): CrossRef, OpenAlex, Unpaywall und Semantic Scholar wiederholten
// dieselbe Form — GET mit AbortSignal.timeout(10000), User-Agent-Header,
// `!response.ok → null`. Hier einmal, damit Timeout und UA nicht driften.
//
// BEWUSST KEIN `import 'server-only'`: die Clients laufen auch im
// tsx-Skript-Pfad (scripts/enrich-orphans.ts, backfill-journal.ts, …), und
// 'server-only' bricht dort den Import (Lektion aus dem Scoring-Split).
//
// BEWUSST KEIN Retry: keiner der vier Clients hatte einen — der
// Batch-Orchestrator behandelt eine gescheiterte Quelle als "keine Daten"
// und probiert die nächste. Neue Retries führt dieser Refactor nicht ein.

/** Kontakt-Mail für die "polite pools" der Metadaten-APIs. Überschreibbar via
 *  API_CONTACT_EMAIL (geteilt mit den Crossref/OpenAlex-Skripten und dem
 *  Unpaywall-`?email=`-Query-Param); der Fallback hält lokale Entwicklung
 *  ohne Extra-Konfiguration am Laufen. */
export function apiContactEmail(): string {
  return process.env.API_CONTACT_EMAIL || 'admin@oeaw.ac.at';
}

/** Einheitlicher User-Agent inkl. mailto — CrossRef und OpenAlex honorieren
 *  die Kontaktadresse mit besseren Rate-Limits ("polite pool"). Vorher stand
 *  die Adresse dort hart codiert; jetzt zieht sie wie bei Unpaywall aus
 *  API_CONTACT_EMAIL (gleicher Default, also verhaltensgleich ohne Env). */
export function politeUserAgent(): string {
  return `OeAW-Press-Relevance/1.0 (mailto:${apiContactEmail()})`;
}

/** User-Agent OHNE mailto — Semantic Scholar kennt keine polite-pool-
 *  Konvention über den UA; der Client hat die Adresse dort nie mitgeschickt,
 *  und das bleibt beim Refactor bewusst so (im Zweifel Verhalten erhalten). */
export const BARE_USER_AGENT = 'OeAW-Press-Relevance/1.0';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchJsonOptions {
  /** Harter Abbruch nach n ms via AbortSignal.timeout. Default 10 000 ms. */
  timeoutMs?: number;
  /** User-Agent-Header (typisch politeUserAgent() oder BARE_USER_AGENT).
   *  Weggelassen = kein UA-Header — Unpaywall schickt keinen, die
   *  Kontaktadresse steckt dort per `?email=` in der URL. */
  userAgent?: string;
  /** Zusätzliche Header (z. B. `Accept: application/json` bei OpenAlex). */
  headers?: Record<string, string>;
}

/** Exakt der Rückgabetyp von response.json() (d. h. `any`, ohne das Literal):
 *  die Clients greifen wie bisher lose auf die Fremd-API-Shapes zu; die vier
 *  APIs eng zu typisieren wäre ein eigener Umbau. */
type JsonBody = Awaited<ReturnType<Response['json']>>;

/** GET → JSON mit Timeout. Nicht-2xx → `null` (die Enrichment-Kaskade wertet
 *  jede Fehlantwort als "keine Daten von dieser Quelle"). Netzwerkfehler und
 *  Timeouts werfen weiter — wie zuvor bei den Inline-fetches; der Aufrufer
 *  entscheidet, ob das einen Batch-Eintrag oder den Lauf abbricht. */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<JsonBody | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, userAgent, headers } = options;

  const merged: Record<string, string> = {
    ...(userAgent ? { 'User-Agent': userAgent } : {}),
    ...headers,
  };

  const response = await fetch(url, {
    headers: Object.keys(merged).length > 0 ? merged : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) return null;
  return response.json();
}
