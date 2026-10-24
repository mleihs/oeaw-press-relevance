// Phase-2 fallback for the ~12% of events whose `event_information` block
// doesn't follow any of the editor conventions the cheerio walker covers
// (prose-only, ad-hoc labels, lone buttons). Sends the stripped text + the
// event title to a small/cheap model and asks for a single JSON-shaped
// answer: `{ "location": "..." | null }`.
//
// Default model is DEFAULT_LLM_MODEL (Opus 5.5 seit 2026-10-24, vorher DeepSeek
// V3 über OpenRouter), at effort low: one short string per event, so the cost
// stays small. Override via EVENTS_LLM_FALLBACK_MODEL; the provider follows the
// model (lib/server/llm-client.ts).

import { z } from 'zod';
import { log } from '@/lib/server/log';
import { getEnv } from '@/lib/server/env';
import { completeJson, envKeyFor, parseJsonContent } from '@/lib/server/llm-client';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';

const ResponseSchema = z.object({
  location: z.string().nullable(),
});

const SYSTEM_PROMPT = `Du extrahierst Veranstaltungs-Adressen aus rich-text-Sidebar-Blöcken von TYPO3-News.

Ausgabe: JSON-Objekt der Form { "location": "..." } oder { "location": null }.

Regeln:
- "location" enthält die GANZE adresse inkl. Saal/Stockwerk falls vorhanden, als ein String mit Komma-Separator.
- Wenn KEIN konkreter Ort genannt ist (nur "TBD", "online", "siehe unten", oder gar kein Hinweis): { "location": null }.
- Online-only Events (Zoom, Webex, Teams ohne physischen Ort): { "location": null }.
- KEINE Erklärungen, KEIN Markdown, KEIN Text außerhalb des JSON-Objekts.
- KEINE Halluzinationen: wenn unklar, gib null zurück.`;

function buildUserPrompt(title: string, eventInfoText: string): string {
  return `Veranstaltungs-Titel: ${title}

Sidebar-Text:
${eventInfoText}`;
}

export interface LlmLocationExtractor {
  (input: { title: string; eventInformation: string }): Promise<string | null>;
}

/** Single-call extraction via the shared LLM client. Returns null on any
 *  error path (network, malformed JSON, schema mismatch, model decline) —
 *  the caller falls back to "no location" which is identical to having
 *  no fallback at all, so this never breaks the sync. Errors are logged
 *  via the structured logger so production silently-degraded behaviour
 *  stays observable. */
export const extractLocationViaLlm: LlmLocationExtractor = async ({
  title,
  eventInformation,
}) => {
  const model = getEnv().EVENTS_LLM_FALLBACK_MODEL;
  const apiKey = envKeyFor(model);
  if (!apiKey) {
    log.warn('events_llm_no_api_key', { model });
    return null;
  }
  const text = decodeHtmlBlock(eventInformation);
  if (text.length < 10) return null;

  try {
    const { content } = await completeJson({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(title, text),
      apiKey,
      model,
      maxTokens: 200,
      temperature: 0.1,
      effort: 'low',
    });
    const parsed = ResponseSchema.safeParse(parseJsonContent(content));
    if (!parsed.success) {
      log.warn('events_llm_schema_mismatch', {
        model,
        issues: parsed.error.issues.map((i) => i.message).slice(0, 3),
      });
      return null;
    }
    const loc = parsed.data.location?.trim() ?? null;
    return loc && loc.length > 0 ? loc : null;
  } catch (err) {
    log.warn('events_llm_exception', {
      model,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};

/** Runs `extractor` for every `NormalizedEvent` that has an
 *  `eventInformation` block but no `locationTitle`, with at most `maxConcurrent`
 *  calls in flight. Mutates the result in place; returns the count actually
 *  filled in (LLM may decline → null → unchanged). */
export async function fillMissingLocationsViaLlm<
  T extends { locationTitle: string | null; eventInformation: string | null; title: string },
>(
  events: T[],
  extractor: LlmLocationExtractor = extractLocationViaLlm,
  maxConcurrent = 5,
): Promise<number> {
  const candidates = events.filter(
    (e) => e.locationTitle === null && e.eventInformation !== null && e.eventInformation.length > 0,
  );
  if (candidates.length === 0) return 0;

  let filled = 0;
  // Simple concurrency control without an extra dependency: chunk the
  // candidate list into batches of `maxConcurrent`, await each batch.
  for (let i = 0; i < candidates.length; i += maxConcurrent) {
    const batch = candidates.slice(i, i + maxConcurrent);
    const results = await Promise.all(
      batch.map((event) =>
        extractor({ title: event.title, eventInformation: event.eventInformation! }),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      const loc = results[j];
      if (loc) {
        batch[j].locationTitle = loc;
        filled++;
      }
    }
  }
  return filled;
}
