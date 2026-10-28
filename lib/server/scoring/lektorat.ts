// Lektorat eines Chunks: ein Modellaufruf, der alle Texte des Chunks auf
// einmal gegenliest (Plan §5.5). Läuft für JEDEN Chunk, auch ohne maschinelle
// Befunde (Nutzer 27.10.: „die Sprache muss deluxe sein").
//
// Frischer Kontext ist hier ein Strukturmerkmal: jeder Aufruf ist zustandslos,
// nichts stumpft über 25 Bewertungen ab (der Grund für den Kontext-Reset nach
// 25 beim In-Chat-Bewerten). Was einem zustandslosen Aufruf fehlt, ist das
// Gedächtnis über den ganzen Lauf; das trägt RunMemory nach: die
// Schlusswendungen und Winkel-Formen aller schon geschriebenen Chunks, damit
// sich eine Wendung nicht chunkweise wiederholt.

import { completeJson, parseJsonContent } from '@/lib/server/llm-client';
import { sanitizeText } from '@/lib/shared/scoring/text-sanitize';
import {
  ANGLE_COLON_FORM,
  CHUNK_FIELDS,
  TEXT_FIELDS,
  closingBigram,
  splitSentences,
  type AuditEntity,
  type AuditFinding,
  type TextField,
} from '@/lib/shared/scoring/text-audit';
import { buildLektoratSystemPrompt, buildLektoratUserPrompt } from './lektorat-prompt';
import type { ScoringCall } from './types';

/** Datensätze je Lektorat-Aufruf, zugleich die Chunk-Größe des Kerns. */
export const LEKTORAT_WINDOW = 25;

/** Einträge je Feld in der Sperrliste; ältere fallen heraus. */
export const MEMORY_CLOSINGS_MAX = 60;

export type AngleForm = 'aussage' | 'frage' | 'doppelpunkt';

/** Was das Lektorat über die schon geschriebenen Chunks eines Laufs weiß. */
export interface RunMemory {
  closings: Partial<Record<TextField, string[]>>;
  angleForms: Record<AngleForm, number>;
}

export const emptyRunMemory = (): RunMemory => ({
  closings: {},
  angleForms: { aussage: 0, frage: 0, doppelpunkt: 0 },
});

export function angleFormOf(angle: string): AngleForm {
  const text = angle.trim();
  if (text.endsWith('?')) return 'frage';
  return ANGLE_COLON_FORM.test(text) ? 'doppelpunkt' : 'aussage';
}

/** Schreibt die Schlüsse und Winkel-Formen eines fertigen Chunks ins Gedächtnis. */
export function rememberChunk(memory: RunMemory, texts: Array<Record<TextField, string>>): void {
  for (const field of CHUNK_FIELDS) {
    const list = memory.closings[field] ?? [];
    for (const t of texts) {
      const last = splitSentences(t[field] ?? '').at(-1);
      const bigram = last === undefined ? null : closingBigram(last);
      if (bigram && !list.includes(bigram)) list.push(bigram);
    }
    memory.closings[field] = list.slice(-MEMORY_CLOSINGS_MAX);
  }
  for (const t of texts) {
    if (t.suggested_angle?.trim()) memory.angleForms[angleFormOf(t.suggested_angle)]++;
  }
}

export interface LektoratItem {
  id: string;
  title: string;
  content: string;
  texts: Record<TextField, string>;
}

export interface LektoratChange {
  id: string;
  texts: Partial<Record<TextField, string>>;
}

export interface LektoratRejection {
  id: string;
  field: TextField;
  reason: string;
}

/** Ein geänderter Text darf höchstens doppelt so lang werden (plus Luft für sehr kurze Felder). */
const MAX_GROWTH = (before: string) => before.length * 2 + 40;

/**
 * Liest die Antwort des Lektorats gegen den Chunk. Übernommen wird nur, was
 * eindeutig ist: eine bekannte Nummer, eines der vier Textfelder, ein nicht
 * leerer, bereinigter Text, der sich vom bisherigen unterscheidet und nicht
 * ausufert. Alles andere landet mit Grund in `rejected`.
 */
export function readLektoratChanges(
  raw: unknown,
  items: readonly LektoratItem[],
): { changes: LektoratChange[]; rejected: LektoratRejection[] } {
  const list = (raw as { changes?: unknown } | null)?.changes;
  const changes = new Map<string, Partial<Record<TextField, string>>>();
  const rejected: LektoratRejection[] = [];
  if (!Array.isArray(list)) return { changes: [], rejected };

  for (const entry of list) {
    const nr = (entry as { nr?: unknown } | null)?.nr;
    const item = typeof nr === 'number' && Number.isInteger(nr) ? items[nr - 1] : undefined;
    if (!item) continue;
    for (const field of TEXT_FIELDS) {
      const value = (entry as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (typeof value !== 'string' || sanitizeText(value) === '') {
        rejected.push({ id: item.id, field, reason: 'leerer oder ungültiger Text' });
        continue;
      }
      const next = sanitizeText(value);
      const before = item.texts[field];
      if (next === before) continue;
      if (next.length > MAX_GROWTH(before)) {
        rejected.push({ id: item.id, field, reason: `Text wuchs von ${before.length} auf ${next.length} Zeichen` });
        continue;
      }
      changes.set(item.id, { ...changes.get(item.id), [field]: next });
    }
  }
  return { changes: [...changes].map(([id, texts]) => ({ id, texts })), rejected };
}

/**
 * Ein Lektorat-Aufruf für einen Chunk, mit Effort max. Liefert nur die
 * übernommenen Änderungen; Scores und Haiku kann die Antwort gar nicht berühren.
 */
export async function lektorat(args: {
  entity: AuditEntity;
  items: LektoratItem[];
  findings: AuditFinding[];
  memory: RunMemory;
  call: ScoringCall;
}): Promise<{ changes: LektoratChange[]; rejected: LektoratRejection[]; cost: number; tokensUsed: number }> {
  const { entity, items, findings, memory, call } = args;
  const user = buildLektoratUserPrompt(
    entity,
    items.map((item) => ({
      title: item.title,
      content: item.content,
      texts: item.texts,
      findings: findings.filter((f) => f.id === item.id),
    })),
    memory,
  );
  const { content, tokensUsed, cost } = await completeJson({
    system: buildLektoratSystemPrompt(entity),
    user,
    apiKey: call.apiKey,
    model: call.model,
    effort: call.effort,
    batch: call.batch,
    // Nur für OpenRouter von Belang; der Anthropic-Transport rechnet mit eigener
    // Obergrenze (Thinking zählt mit). gate.ts lässt ohnehin nur Anthropic durch.
    maxTokens: 400 * items.length + 500,
  });
  return { ...readLektoratChanges(parseJsonContent<unknown>(content), items), cost, tokensUsed };
}
