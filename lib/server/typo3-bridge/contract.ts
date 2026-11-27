import type { Decision, EventLang } from '@/lib/shared/types';

// Wire-Format der TYPO3-Bridge, wie es die Chrome-Extension „ÖAW TYPO3
// Toolkit" (Event-Assistent, sidepanel.js) liest. Verbindlich ist der Vertrag
// in docs/TYPO3_BRIDGE.md; Änderungen hier brauchen eine passende Extension.
// Ein Blatt-Modul ohne Laufzeit-Abhängigkeiten: Lesesicht, Entwurf und Routen
// teilen es, ohne einander zu importieren.

/** GET /api/typo3-bridge/events: ein Listeneintrag. */
export interface BridgeEventSummary {
  id: string;
  webdb_uid: number;
  title: string;
  teaser: string | null;
  event_at: string;
  event_end_at: string | null;
  location_title: string | null;
  organizer_title: string | null;
  institute: string | null;
  lang: EventLang | null;
  available_langs: EventLang[];
  url: string | null;
  decision: Decision;
  has_bodytext: boolean;
  has_draft: boolean;
}

/** GET /api/typo3-bridge/events */
export interface BridgeEventList {
  events: BridgeEventSummary[];
  /** Stand des letzten Imports (jüngstes events.synced_at). */
  synced_at: string | null;
}

/** GET /api/typo3-bridge/events/:id */
export interface BridgeEventDetail extends BridgeEventSummary {
  /** HTML so, wie es aus TYPO3 kommt; die Extension säubert beim Anzeigen. */
  bodytext: string | null;
  /** Serverseitig gesäubertes HTML (sanitizeEventInformation). */
  event_information: string | null;
}

/** Der Entwurf, Schlüssel = logische TYPO3-Felder (Zuordnung im Vertrag). */
export interface BridgeDraft {
  title: string;
  teaser: string;
  bodytext_html: string;
  seo_description: string;
  alternative_title: string | null;
  keywords: string;
  location: string | null;
  organizer: string | null;
  speaker: string | null;
  event_start: string | null;
  event_end: string | null;
  full_day: boolean;
  language_en: boolean;
}

/** POST /api/typo3-bridge/events/:id/draft, Body (optional). */
export interface BridgeDraftRequest {
  refresh?: boolean;
  instructions?: string;
}

/** POST /api/typo3-bridge/events/:id/draft */
export interface BridgeDraftResponse {
  draft: BridgeDraft;
  notes: string[];
  model: string;
  generated_at: string;
  cached: boolean;
}

/** POST /api/typo3-bridge/news/assist (News-Wizard, Vertrag v2), Aufgabe `texts`. */
export interface BridgeNewsTextSuggestions {
  title: string | null;
  category_title: string | null;
  category_subtitle: string | null;
  teaser: string | null;
  seo_description: string | null;
  alternative_title: string | null;
  keywords: string | null;
}

/** POST /api/typo3-bridge/news/assist, Aufgabe `image`. */
export interface BridgeNewsImageSuggestions {
  alt_text: string | null;
  caption: string | null;
}

/** POST /api/typo3-bridge/news/assist. Zustandslos: nichts wird gespeichert. */
export interface BridgeNewsAssistResponse {
  suggestions: BridgeNewsTextSuggestions | BridgeNewsImageSuggestions;
  notes: string[];
  model: string;
  generated_at: string;
}

/** Postgres-Zeitstempel → ISO 8601 in UTC, ohne `.000` bei vollen Sekunden
 *  (`2026-12-16T17:00:00Z` wie im Vertrag). */
export function toIso(ts: string): string;
export function toIso(ts: string | null): string | null;
export function toIso(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toISOString().replace('.000Z', 'Z');
}
