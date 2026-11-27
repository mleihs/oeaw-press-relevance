import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AnthropicEffort } from '@/lib/server/anthropic';
import { usageOf } from '@/lib/server/anthropic';
import type { TokenUsage } from '@/lib/server/llm-types';
import { sanitizeText } from '@/lib/shared/scoring/text-sanitize';
import { toIso, type BridgeNewsAssistResponse, type BridgeNewsImageSuggestions, type BridgeNewsTextSuggestions } from './contract';
import { clipAtWord, DRAFT_MODEL, DraftNotConfiguredError, DraftRefusedError, DraftUnusableError, type DraftClient } from './draft';
import {
  buildNewsImageText,
  buildNewsTextsMessage,
  NEWS_IMAGE_SYSTEM_PROMPT,
  NEWS_LIMITS,
  NEWS_TEXTS_SYSTEM_PROMPT,
  NEWS_TITLE_TARGET,
  NewsImageOutputSchema,
  NewsTextsOutputSchema,
  type NewsAssistRequest,
  type NewsImageOutput,
  type NewsTextsOutput,
} from './news-assist-prompt';

// KI-Hilfe im News-Wizard (POST /api/typo3-bridge/news/assist): ein
// Claude-Aufruf mit Structured Outputs, dann Säubern, Kürzen und Hinweise.
// Zustandslos: nichts wird gespeichert, jede Anfrage ist ein bezahlter Aufruf.
// Modell, Fehlerklassen und Fehlerabbildung teilt sich die Route mit dem
// Event-Entwurf (./draft.ts, ./errors.ts).

/**
 * Effort je Aufgabe. Texte: `high` wie der Event-Entwurf, die Antwort ist
 * kurz. Bild: `medium`, Alt-Text und Unterschrift brauchen wenig Nachdenken,
 * und das Panel wartet nur 60 s.
 */
export const NEWS_EFFORT: Record<NewsAssistRequest['task'], AnthropicEffort> = { texts: 'high', image: 'medium' };

/** Thinking zählt in max_tokens; die Antworten selbst sind wenige hundert Tokens. */
const NEWS_MAX_TOKENS: Record<NewsAssistRequest['task'], number> = { texts: 16_000, image: 8_000 };

/** Knapp unter den Wartezeiten des Panels (texts 90 s, image 60 s) und unter
 *  den rund 100 s, nach denen Cloudflare vor der Box trennt. Kein zweiter
 *  Versuch: er käme beim Panel nicht mehr an. */
const NEWS_TIMEOUT_MS: Record<NewsAssistRequest['task'], number> = { texts: 85_000, image: 55_000 };

export interface GeneratedNewsAssist {
  response: BridgeNewsAssistResponse;
  effort: AnthropicEffort;
  usage: TokenUsage;
}

/** Client für den echten Aufruf; Tests geben einen Mock. */
export function createNewsAssistClient(task: NewsAssistRequest['task']): DraftClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new DraftNotConfiguredError();
  return new Anthropic({ apiKey, maxRetries: 0, timeout: NEWS_TIMEOUT_MS[task] });
}

// --- Nachbearbeitung -----------------------------------------------------------

const LABEL: Record<keyof typeof NEWS_LIMITS | 'keywords', string> = {
  title: 'Titel',
  category_title: 'Dachzeile oben',
  category_subtitle: 'Dachzeile unten',
  teaser: 'Teaser',
  seo_description: 'SEO-Beschreibung',
  alternative_title: 'Alternativer Titel',
  keywords: 'Keywords',
  alt_text: 'Alternativtext',
  caption: 'Bildunterschrift',
};

/** Anführungszeichen, die einen ganzen Wert umschließen (Vertrag: keine). */
const WRAPPING_QUOTES: [string, string][] = [['„', '"'], ['„', '“'], ['"', '"'], ['“', '”'], ['»', '«'], ['«', '»'], ["'", "'"], ['‚', "'"]];

/** Reiner Text ohne umschließende Anführungszeichen; leer → null. */
export function cleanValue(s: string | null): string | null {
  if (s == null) return null;
  let t = sanitizeText(s);
  for (const [open, close] of WRAPPING_QUOTES) {
    if (t.length > 1 && t.startsWith(open) && t.endsWith(close) && !t.slice(1, -1).includes(close)) {
      t = t.slice(1, -1).trim();
      break;
    }
  }
  return t ? t : null;
}

/** Kürzen ohne Auslassungszeichen, an einer Wortgrenze: für die Dachzeilen,
 *  wo ein „…" in der Zeile über dem Titel stünde. */
export function clipWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : s.slice(0, max)).replace(/[\s,;:.&–-]+$/, '');
}

/** Keywords: Trenner vereinheitlichen, Dubletten und Leeres weg. */
export function normalizeKeywords(s: string | null): string | null {
  if (s == null) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(/[,;\n]/)) {
    const t = cleanValue(part);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.length ? out.join(', ') : null;
}

/** Gedankenstrich nach docs/writing-style.md (Bis-Strich „10–12" bleibt erlaubt). */
const DASH_RE = /—|\s–\s/;

type Limited = keyof typeof NEWS_LIMITS;

function limit(key: Limited, value: string | null, notes: string[]): string | null {
  const max = NEWS_LIMITS[key];
  if (value == null || value.length <= max) return value;
  notes.push(`${LABEL[key]}: länger als ${max} Zeichen, gekürzt.`);
  return key === 'category_title' || key === 'category_subtitle' ? clipWords(value, max) : clipAtWord(value, max);
}

function missing(suggestions: Record<string, string | null>, notes: string[]): void {
  for (const [k, v] of Object.entries(suggestions)) if (v == null) notes.push(`${LABEL[k as keyof typeof LABEL]}: kein Vorschlag.`);
}

function modelNotes(notes: string[]): string[] {
  return notes.map((n) => sanitizeText(n)).filter(Boolean);
}

function dashNote(values: (string | null)[], notes: string[]): void {
  if (values.some((v) => v != null && DASH_RE.test(v))) {
    notes.push('Ein Vorschlag enthält einen Gedankenstrich; der Hausstil verzichtet darauf (docs/writing-style.md).');
  }
}

export function finalizeNewsTexts(output: NewsTextsOutput): { suggestions: BridgeNewsTextSuggestions; notes: string[] } {
  const notes = modelNotes(output.notes);
  const suggestions: BridgeNewsTextSuggestions = {
    title: limit('title', cleanValue(output.title), notes),
    category_title: limit('category_title', cleanValue(output.category_title), notes),
    category_subtitle: limit('category_subtitle', cleanValue(output.category_subtitle), notes),
    teaser: limit('teaser', cleanValue(output.teaser), notes),
    seo_description: limit('seo_description', cleanValue(output.seo_description), notes),
    alternative_title: limit('alternative_title', cleanValue(output.alternative_title), notes),
    keywords: normalizeKeywords(output.keywords),
  };
  if (suggestions.title && suggestions.title.length > NEWS_TITLE_TARGET) {
    notes.push(`Titel: länger als ${NEWS_TITLE_TARGET} Zeichen (Ziel), bitte prüfen.`);
  }
  missing({ ...suggestions }, notes);
  dashNote(Object.values(suggestions), notes);
  return { suggestions, notes: [...new Set(notes)] };
}

export function finalizeNewsImage(output: NewsImageOutput): { suggestions: BridgeNewsImageSuggestions; notes: string[] } {
  const notes = modelNotes(output.notes);
  const suggestions: BridgeNewsImageSuggestions = {
    alt_text: limit('alt_text', cleanValue(output.alt_text), notes),
    caption: limit('caption', cleanValue(output.caption), notes),
  };
  missing({ ...suggestions }, notes);
  dashNote(Object.values(suggestions), notes);
  return { suggestions, notes: [...new Set(notes)] };
}

// --- Aufruf --------------------------------------------------------------------

/** stop_reason vor dem Inhalt: bei einer Ablehnung passt die Ausgabe nicht
 *  zum Schema, bei max_tokens ist sie unvollständig. */
function parsedOrThrow<T>(message: { stop_reason: string | null; stop_details?: { category?: string | null } | null; parsed_output?: T | null }, maxTokens: number): T {
  if (message.stop_reason === 'refusal') {
    throw new DraftRefusedError(message.stop_details?.category ?? 'ohne Kategorie');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new DraftUnusableError(`Claude-Antwort bei max_tokens=${maxTokens} abgeschnitten.`);
  }
  if (!message.parsed_output) throw new DraftUnusableError('Claude-Antwort enthält keine Vorschläge im erwarteten Format.');
  return message.parsed_output;
}

/** Bilddaten ohne `data:…;base64,`-Vorspann und ohne Leerraum. */
export function imageBase64(data: string): string {
  return data.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
}

/** Bytes nach dem Dekodieren, ohne zu dekodieren. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/**
 * Ein Aufruf für `req`. Die Route hat Mindestlänge, Bildgröße und Bildpflicht
 * schon geprüft. SDK-Fehler fliegen unverändert weiter; die Route bildet sie
 * ab (./errors.ts).
 */
export async function generateNewsAssist(req: NewsAssistRequest, client: DraftClient, now = new Date()): Promise<GeneratedNewsAssist> {
  const task = req.task;
  const effort = NEWS_EFFORT[task];
  const maxTokens = NEWS_MAX_TOKENS[task];

  if (task === 'texts') {
    const message = await client.messages
      .stream({
        model: DRAFT_MODEL,
        max_tokens: maxTokens,
        output_config: { effort, format: zodOutputFormat(NewsTextsOutputSchema) },
        system: NEWS_TEXTS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildNewsTextsMessage(req) }],
      })
      .finalMessage();
    const { suggestions, notes } = finalizeNewsTexts(parsedOrThrow(message, maxTokens));
    return { response: { suggestions, notes, model: DRAFT_MODEL, generated_at: toIso(now.toISOString()) }, effort, usage: usageOf(message) };
  }

  const image = req.image!;
  const message = await client.messages
    .stream({
      model: DRAFT_MODEL,
      max_tokens: maxTokens,
      output_config: { effort, format: zodOutputFormat(NewsImageOutputSchema) },
      system: NEWS_IMAGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.media_type, data: imageBase64(image.data) } },
            { type: 'text', text: buildNewsImageText(req) },
          ],
        },
      ],
    })
    .finalMessage();
  const { suggestions, notes } = finalizeNewsImage(parsedOrThrow(message, maxTokens));
  return { response: { suggestions, notes, model: DRAFT_MODEL, generated_at: toIso(now.toISOString()) }, effort, usage: usageOf(message) };
}
