import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { DraftClient } from './draft';
import type { DraftOutput, DraftSource } from './draft-prompt';

// Gemeinsame Testdaten der TYPO3-Bridge (draft.test.ts, draft-service.test.ts):
// das Event aus dem Extension-Mock (tests/event-assistant/mock-servers.mjs im
// Extension-Repo) und ein SDK-Client-Mock ohne Netz.

export const SOURCE: DraftSource = {
  id: '11111111-1111-4111-8111-111111111111',
  webdbUid: 40455,
  title: 'ÖAW Christmas Talk 2026: Das neue Zeitalter der Imperien',
  teaser: 'Herfried Münkler diskutiert im Gespräch mit Moderatorin …',
  bodytext: '<p>In Kooperation mit krone.tv beleuchtet der diesjährige Christmas Talk …</p><p><a href="t3://page?uid=1">intern</a></p>',
  eventInformation: '<h5>Ort</h5><p>Festsaal</p>',
  eventAt: '2026-12-16 17:00:00+00',
  eventEndAt: null,
  locationTitle: 'Festsaal der ÖAW, Dr. Ignaz Seipel-Platz 2, 1010 Wien',
  organizerTitle: 'ÖAW',
  institute: 'ÖAW',
  url: 'https://www.oeaw.ac.at/detail/veranstaltung/x',
  lang: 'de',
  availableLangs: ['de'],
};

export const OUTPUT: DraftOutput = {
  title: 'Christmas Talk 2026: Herfried Münkler über das neue Zeitalter der Imperien',
  teaser: 'Politikwissenschaftler Herfried Münkler spricht über Großmächte und Weltordnung.',
  bodytext_html: '<p>Wie verändert sich die Weltordnung?</p><p>Herfried Münkler im Gespräch.</p>',
  seo_description: 'Christmas Talk 2026 der ÖAW mit Herfried Münkler über Großmächte und Weltordnung.',
  alternative_title: null,
  keywords: 'Imperien, Weltordnung, Münkler',
  location: 'Festsaal der ÖAW, Wien',
  organizer: 'Österreichische Akademie der Wissenschaften',
  speaker: 'Herfried Münkler',
  full_day: false,
  language_en: false,
  notes: [],
};

/** Die drei GMI-Events aus dem wwwt1-Export vom 2026-11-27
 *  (fixtures/wwwt1-event_news_grouped-2026-11-27.json): bodytext nur Eckdaten,
 *  40269 mit Platzhaltertitel. Musterfall für den Entwurf aus Eckdaten. Die
 *  uids gelten nur auf wwwt1; in Prod gehört 40269 zu einem anderen Event. */
export const WWWT1_SOURCES: DraftSource[] = (
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures/wwwt1-event_news_grouped-2026-11-27.json'), 'utf8')) as {
    data: Record<string, { events: Array<{ uid: number; title: string; datetime: number; location_simple: string | null; organizer_simple: string | null; bodytext: string }> }>;
  }
).data.GMI!.events.map((e) => ({
  id: `00000000-0000-4000-8000-0000000${e.uid}`,
  webdbUid: e.uid,
  title: e.title,
  teaser: null,
  bodytext: e.bodytext.trim(),
  eventInformation: null,
  eventAt: new Date(e.datetime * 1000).toISOString(),
  eventEndAt: null,
  locationTitle: e.location_simple,
  organizerTitle: e.organizer_simple,
  institute: 'GMI',
  url: null,
  lang: null,
  availableLangs: [],
}));

type FakeMessage = Partial<Anthropic.Message> & { parsed_output?: DraftOutput | null };

export function message(overrides: FakeMessage = {}): FakeMessage {
  return {
    id: 'msg_test',
    model: 'claude-opus-5-5',
    role: 'assistant',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(OUTPUT), citations: null }],
    usage: {
      input_tokens: 1200,
      output_tokens: 900,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Anthropic.Usage,
    parsed_output: OUTPUT,
    ...overrides,
  };
}

/** Ein SDK-Client, dessen messages.stream().finalMessage() `msg` liefert. */
export function mockClient(msg: FakeMessage | (() => Promise<FakeMessage>)) {
  const stream = vi.fn(() => ({
    finalMessage: typeof msg === 'function' ? msg : async () => msg,
  }));
  return { client: { messages: { stream } } as unknown as DraftClient, stream };
}
