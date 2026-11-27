import 'server-only';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import sanitizeHtml from 'sanitize-html';
import { anthropicModelId, usageOf, type AnthropicEffort } from '@/lib/server/anthropic';
import type { TokenUsage } from '@/lib/server/llm-types';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import { sanitizeText } from '@/lib/shared/scoring/text-sanitize';
import { toIso, type BridgeDraft } from './contract';
import {
  ALTERNATIVE_TITLE_MAX,
  buildDraftUserMessage,
  DRAFT_SYSTEM_PROMPT,
  DraftOutputSchema,
  SEO_DESCRIPTION_MAX,
  type DraftOutput,
  type DraftSource,
} from './draft-prompt';

// KI-Entwurf eines Events für die TYPO3-Felder: ein Claude-Aufruf mit
// Structured Outputs (Prompt und Schema: ./draft-prompt.ts), dann die
// Nachbearbeitung in die Vertragsform (./contract.ts). Keine DB; speichern und
// zwischenspeichern macht ./draft-service.ts. Die Redakteurin prüft jedes Feld
// im Panel und speichert selbst in TYPO3.
//
// Über den eigenen SDK-Client statt lib/server/llm-client.ts: die Fassade dort
// liefert JSON-Text für die Bewertung und fällt ohne ANTHROPIC_API_KEY auf
// OpenRouter zurück. Der Entwurf braucht Structured Outputs und das geparste
// Ergebnis; ohne Anthropic-Key gibt es ihn nicht (503).

/** App-Format (Preisliste, Modell-Tags); an die API geht `claude-opus-5-5`. */
export const DRAFT_APP_MODEL = DEFAULT_LLM_MODEL;
export const DRAFT_MODEL = anthropicModelId(DRAFT_APP_MODEL) ?? 'claude-opus-5-5';

/**
 * `high`, nicht `max` wie die Bewertung: ein Entwurf ist Textarbeit für eine
 * Person, die im Panel wartet, und jede Antwort prüft sie ohnehin. Opus 5.5
 * liefe ohne Angabe auf `medium`.
 */
export const DRAFT_EFFORT: AnthropicEffort = 'high';

/** Thinking zählt bei Opus 5.5 in max_tokens; ein Entwurf braucht einen
 *  Bruchteil davon. Bezahlt wird nur, was erzeugt wird. */
const DRAFT_MAX_TOKENS = 64_000;

export interface GeneratedDraft {
  draft: BridgeDraft;
  notes: string[];
  model: string;
  effort: AnthropicEffort;
  usage: TokenUsage;
}

/** SHA-256 über die Quelldaten, aus denen ein Entwurf entsteht. Ändert sich
 *  einer der Werte (Nachtimport), gilt ein gespeicherter Entwurf als veraltet. */
export function sourceHashOf(source: DraftSource): string {
  const basis = [
    source.title,
    source.teaser,
    source.bodytext,
    source.eventInformation,
    toIso(source.eventAt),
    toIso(source.eventEndAt),
    source.locationTitle,
    source.organizerTitle,
    source.institute,
    source.url,
    source.lang,
  ];
  return createHash('sha256').update(JSON.stringify(basis), 'utf8').digest('hex');
}

// --- Nachbearbeitung -------------------------------------------------------

const DRAFT_LINK_RE = /^(https?:\/\/|mailto:)/i;

/** Nicht erlaubte Tags verwirft sanitize-html, ihr Text bleibt stehen. Ein
 *  Link ohne gültiges Ziel wird deshalb zu einem solchen Tag: sein Text
 *  bleibt, der Link fällt weg. */
const unwrap: sanitizeHtml.Transformer = () => ({ tagName: 'span', attribs: {} });
const to = (tagName: string): sanitizeHtml.Transformer => () => ({ tagName, attribs: {} });

/** Erlaubtes HTML im Fließtext (Vertrag), alles andere fällt weg. */
export function sanitizeDraftHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: (tagName, attribs) =>
        DRAFT_LINK_RE.test(attribs.href ?? '') ? { tagName: 'a', attribs: { href: attribs.href! } } : unwrap(tagName, attribs),
      h1: to('h3'),
      h2: to('h3'),
      h4: to('h3'),
      b: to('strong'),
      i: to('em'),
    },
    exclusiveFilter: (frame) => ['p', 'h3', 'li'].includes(frame.tag) && !frame.text.trim(),
  }).trim();
}

/** Reiner Text: Tags und Entities weg, Leerraum geglättet; leer → null. */
function plainOrNull(s: string | null): string | null {
  if (s == null) return null;
  const t = sanitizeText(s);
  return t ? t : null;
}

/** Auf `max` Zeichen an einer Wortgrenze kürzen, mit Auslassungszeichen. */
export function clipAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** Gedankenstrich nach docs/writing-style.md: Geviertstrich, oder Halbgeviert
 *  mit Leerzeichen (der Bis-Strich „10–12" bleibt erlaubt). */
const DASH_RE = /—|\s–\s/;

/**
 * Modellausgabe → Vertragsform. Säubert HTML und Textfelder, setzt Beginn und
 * Ende aus den Quelldaten, prüft die Längengrenzen und ergänzt die Hinweise,
 * die der Code sicherer weiß als das Modell.
 */
export function finalizeDraft(output: DraftOutput, source: DraftSource): { draft: BridgeDraft; notes: string[] } {
  const notes = output.notes.map((n) => sanitizeText(n)).filter(Boolean);

  let seo = plainOrNull(output.seo_description) ?? '';
  if (seo.length > SEO_DESCRIPTION_MAX) {
    seo = clipAtWord(seo, SEO_DESCRIPTION_MAX);
    notes.push(`Die SEO-Beschreibung war länger als ${SEO_DESCRIPTION_MAX} Zeichen und wurde gekürzt.`);
  }
  let altTitle = plainOrNull(output.alternative_title);
  if (altTitle && altTitle.length > ALTERNATIVE_TITLE_MAX) {
    altTitle = clipAtWord(altTitle, ALTERNATIVE_TITLE_MAX);
    notes.push(`Der alternative Titel war länger als ${ALTERNATIVE_TITLE_MAX} Zeichen und wurde gekürzt.`);
  }

  const draft: BridgeDraft = {
    title: plainOrNull(output.title) ?? source.title,
    teaser: plainOrNull(output.teaser) ?? '',
    bodytext_html: sanitizeDraftHtml(output.bodytext_html),
    seo_description: seo,
    alternative_title: altTitle,
    keywords: plainOrNull(output.keywords) ?? '',
    location: plainOrNull(output.location),
    organizer: plainOrNull(output.organizer),
    speaker: plainOrNull(output.speaker),
    event_start: toIso(source.eventAt),
    event_end: toIso(source.eventEndAt),
    full_day: output.full_day,
    language_en: output.language_en,
  };

  if (!source.eventEndAt) notes.push('Das Ende der Veranstaltung fehlt in den Quelldaten.');
  const texts = [draft.title, draft.teaser, draft.bodytext_html, draft.seo_description, draft.alternative_title ?? ''];
  if (texts.some((t) => DASH_RE.test(t))) {
    notes.push('Der Entwurf enthält einen Gedankenstrich; der Hausstil verzichtet darauf (docs/writing-style.md).');
  }
  return { draft, notes: [...new Set(notes)] };
}

// --- Fehler ----------------------------------------------------------------

/** Claude hat abgelehnt (stop_reason refusal). Bezahlt, aber ohne Entwurf. */
export class DraftRefusedError extends Error {
  constructor(public readonly category: string) {
    super(`Claude hat den Entwurf abgelehnt (${category}).`);
    this.name = 'DraftRefusedError';
  }
}

/** Die Antwort ist kein brauchbarer Entwurf (abgeschnitten oder ohne JSON). */
export class DraftUnusableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftUnusableError';
  }
}

/** Kein ANTHROPIC_API_KEY: Entwürfe laufen nur direkt über Anthropic. */
export class DraftNotConfiguredError extends Error {
  constructor() {
    super('KI-Entwurf nicht konfiguriert (ANTHROPIC_API_KEY fehlt).');
    this.name = 'DraftNotConfiguredError';
  }
}

// --- Aufruf ----------------------------------------------------------------

/** Der Teil des SDK-Clients, den der Entwurf braucht (Tests geben einen Mock). */
export type DraftClient = Pick<Anthropic, 'messages'>;

/** Client für den echten Aufruf. Ein Wiederholversuch statt zwei: im Panel
 *  wartet ein Mensch, und vor der Box kappt Cloudflare nach rund 100 s. */
export function createDraftClient(): DraftClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new DraftNotConfiguredError();
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 240_000 });
}

/**
 * Ein Entwurf für `source`. Streaming wegen der hohen max_tokens (das SDK
 * verlangt es), ausgewertet wird nur die fertige Nachricht. Ohne
 * Server-Fallback auf ein anderes Modell, wie im übrigen Projekt
 * (lib/server/anthropic.ts): eine Ablehnung kommt als 422 beim Panel an.
 * SDK-Fehler (Anthropic.APIError und Unterklassen) fliegen unverändert weiter;
 * die Route bildet sie ab (./errors.ts).
 */
export async function generateDraft(
  source: DraftSource,
  instructions: string | null,
  client: DraftClient,
): Promise<GeneratedDraft> {
  const message = await client.messages
    .stream({
      model: DRAFT_MODEL,
      max_tokens: DRAFT_MAX_TOKENS,
      output_config: { effort: DRAFT_EFFORT, format: zodOutputFormat(DraftOutputSchema) },
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildDraftUserMessage(source, instructions) }],
    })
    .finalMessage();

  // Vor dem Inhalt immer stop_reason: bei einer Ablehnung passt die Ausgabe
  // nicht zum Schema, bei max_tokens ist sie unvollständig.
  if (message.stop_reason === 'refusal') {
    throw new DraftRefusedError(message.stop_details?.category ?? 'ohne Kategorie');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new DraftUnusableError(`Claude-Antwort bei max_tokens=${DRAFT_MAX_TOKENS} abgeschnitten.`);
  }
  const output = message.parsed_output;
  if (!output) throw new DraftUnusableError('Claude-Antwort enthält keinen Entwurf im erwarteten Format.');

  const { draft, notes } = finalizeDraft(output, source);
  return { draft, notes, model: DRAFT_MODEL, effort: DRAFT_EFFORT, usage: usageOf(message) };
}
