import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { message, mockClient } from './test-fixtures';
import { DraftRefusedError, DraftUnusableError } from './draft';
import {
  base64Bytes,
  cleanValue,
  clipWords,
  finalizeNewsImage,
  finalizeNewsTexts,
  generateNewsAssist,
  imageBase64,
  normalizeKeywords,
} from './news-assist';
import {
  NEWS_IMAGE_SYSTEM_PROMPT,
  NEWS_TEXTS_SYSTEM_PROMPT,
  NewsAssistRequestSchema,
  newsTextLength,
  type NewsImageOutput,
  type NewsTextsOutput,
} from './news-assist-prompt';

// KI-Hilfe im News-Wizard ohne echten Claude-Aufruf: der SDK-Client ist ein
// Mock (test-fixtures.ts), der eine fertige Nachricht liefert. Geprüft werden
// Request-Form beider Aufgaben, stop_reason-Behandlung, Kürzen mit Hinweis und
// das Säubern der Werte.

const BODY = '<p>Forschende des Instituts für Weltraumforschung der ÖAW haben mit dem Satelliten X die Magnetosphäre der Erde vermessen.</p><p>Die Daten zeigen, wie Sonnenstürme das Magnetfeld verformen und warum das für Satelliten und Stromnetze wichtig ist.</p>';

const req = (over: Record<string, unknown> = {}) =>
  NewsAssistRequestSchema.parse({ task: 'texts', title: 'Sonnenstürme vermessen', bodytext_html: BODY, ...over });

const TEXTS: NewsTextsOutput = {
  title: 'Wie Sonnenstürme das Magnetfeld der Erde verformen',
  category_title: 'Weltraum',
  category_subtitle: 'Weltraumforschung',
  teaser: 'Ein ÖAW-Team hat mit einem Satelliten gemessen, wie Sonnenstürme das Magnetfeld verformen.',
  seo_description: 'Das Institut für Weltraumforschung der ÖAW zeigt, wie Sonnenstürme das Magnetfeld der Erde verformen.',
  alternative_title: 'Sonnenstürme verformen das Magnetfeld',
  keywords: 'Sonnenstürme, Magnetosphäre, Satellit',
  notes: [],
};

const IMAGE: NewsImageOutput = {
  alt_text: 'Ein Satellit vor der Erde, im Hintergrund die Sonne.',
  caption: 'Mit diesem Satelliten vermaß das Team die Magnetosphäre.',
  notes: [],
};

const asMsg = (parsed: unknown, over: Partial<Anthropic.Message> = {}) =>
  message({ parsed_output: parsed as never, content: [{ type: 'text', text: JSON.stringify(parsed), citations: null }], ...over });

const paramsOf = (stream: { mock: { calls: unknown[][] } }) => stream.mock.calls[0]![0] as Anthropic.MessageCreateParams;

describe('generateNewsAssist: texts', () => {
  it('ruft Opus 5.5 mit Effort high, Structured Output, dem Text und dem Wunsch auf', async () => {
    const { client, stream } = mockClient(asMsg(TEXTS));
    const res = await generateNewsAssist(req({ instructions: 'Titel ohne Fachbegriffe.' }), client, new Date('2026-11-27T08:00:00Z'));

    const params = paramsOf(stream);
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config?.effort).toBe('high');
    expect(params.output_config?.format?.type).toBe('json_schema');
    expect(params.system).toBe(NEWS_TEXTS_SYSTEM_PROMPT);
    expect(params).not.toHaveProperty('temperature');
    const user = params.messages[0]!.content as string;
    expect(user).toContain('Satelliten X');
    expect(user).toContain('<wunsch>\nTitel ohne Fachbegriffe.\n</wunsch>');
    expect(user).toContain('Art des Beitrags: News');

    expect(res.response).toEqual({
      suggestions: { ...TEXTS, notes: undefined },
      notes: [],
      model: 'claude-opus-5-5',
      generated_at: '2026-11-27T08:00:00Z',
    });
    expect(res.usage).toEqual({ promptTokens: 1200, completionTokens: 900 });
  });

  it('nennt Top-News im Prompt', async () => {
    const { client, stream } = mockClient(asMsg(TEXTS));
    await generateNewsAssist(req({ kind: 'top' }), client);
    expect(paramsOf(stream).messages[0]!.content as string).toContain('Top-News (Slider auf der Startseite');
  });

  it('wirft DraftRefusedError bei refusal und DraftUnusableError bei max_tokens oder ohne Ausgabe', async () => {
    const refused = asMsg(null, {
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null } as Anthropic.Message['stop_details'],
    });
    await expect(generateNewsAssist(req(), mockClient(refused).client)).rejects.toBeInstanceOf(DraftRefusedError);
    await expect(generateNewsAssist(req(), mockClient(asMsg(TEXTS, { stop_reason: 'max_tokens' })).client)).rejects.toBeInstanceOf(
      DraftUnusableError,
    );
    await expect(generateNewsAssist(req(), mockClient(asMsg(null)).client)).rejects.toBeInstanceOf(DraftUnusableError);
  });
});

describe('generateNewsAssist: image', () => {
  it('schickt das Bild als base64-Block vor dem Kontext, mit Effort medium', async () => {
    const { client, stream } = mockClient(asMsg(IMAGE));
    const res = await generateNewsAssist(
      req({ task: 'image', image: { media_type: 'image/webp', data: 'data:image/webp;base64,UklG\nRg==' } }),
      client,
    );
    const params = paramsOf(stream);
    expect(params.output_config?.effort).toBe('medium');
    expect(params.system).toBe(NEWS_IMAGE_SYSTEM_PROMPT);
    const content = params.messages[0]!.content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'UklGRg==' } });
    expect(content[1]).toMatchObject({ type: 'text' });
    expect((content[1] as Anthropic.TextBlockParam).text).toContain('Satelliten X');
    expect(res.response.suggestions).toEqual({ alt_text: IMAGE.alt_text, caption: IMAGE.caption });
  });
});

describe('finalizeNewsTexts', () => {
  it('kürzt über den harten Grenzen und sagt es in notes', () => {
    const { suggestions, notes } = finalizeNewsTexts({
      ...TEXTS,
      title: 'Wort '.repeat(30).trim(), // 149 Zeichen
      category_title: 'Russischer Eurasismus und die Geschichte',
      teaser: 'Satz. '.repeat(60).trim(),
      seo_description: 'Beschreibung '.repeat(20).trim(),
      alternative_title: 'Ein sehr langer alternativer Titel für Suchmaschinen und noch mehr',
    });
    expect(suggestions.title!.length).toBeLessThanOrEqual(100);
    expect(suggestions.title!.endsWith('…')).toBe(true);
    expect(suggestions.category_title).toBe('Russischer Eurasismus und die');
    expect(suggestions.teaser!.length).toBeLessThanOrEqual(250);
    expect(suggestions.seo_description!.length).toBeLessThanOrEqual(160);
    expect(suggestions.alternative_title!.length).toBeLessThanOrEqual(60);
    expect(notes).toEqual(
      expect.arrayContaining([
        'Titel: länger als 100 Zeichen, gekürzt.',
        'Dachzeile oben: länger als 30 Zeichen, gekürzt.',
        'Teaser: länger als 250 Zeichen, gekürzt.',
        'SEO-Beschreibung: länger als 160 Zeichen, gekürzt.',
        'Alternativer Titel: länger als 60 Zeichen, gekürzt.',
        'Titel: länger als 80 Zeichen (Ziel), bitte prüfen.',
      ]),
    );
  });

  it('säubert Werte, meldet fehlende Vorschläge und Gedankenstriche', () => {
    const { suggestions, notes } = finalizeNewsTexts({
      ...TEXTS,
      title: '„Sonnenstürme vermessen“',
      category_subtitle: null,
      teaser: '<p>Ein Team misst — mit einem Satelliten.</p>',
      keywords: 'Sonne; sonne, Magnetfeld,,  Satellit',
      notes: ['  Der Text nennt kein Datum. '],
    });
    expect(suggestions.title).toBe('Sonnenstürme vermessen');
    expect(suggestions.teaser).toBe('Ein Team misst — mit einem Satelliten.');
    expect(suggestions.keywords).toBe('Sonne, Magnetfeld, Satellit');
    expect(suggestions.category_subtitle).toBeNull();
    expect(notes).toEqual([
      'Der Text nennt kein Datum.',
      'Dachzeile unten: kein Vorschlag.',
      'Ein Vorschlag enthält einen Gedankenstrich; der Hausstil verzichtet darauf (docs/writing-style.md).',
    ]);
  });
});

describe('finalizeNewsImage', () => {
  it('kürzt Alt-Text und Bildunterschrift', () => {
    const { suggestions, notes } = finalizeNewsImage({ alt_text: 'Sehr '.repeat(40).trim(), caption: 'Lang '.repeat(50).trim(), notes: [] });
    expect(suggestions.alt_text!.length).toBeLessThanOrEqual(150);
    expect(suggestions.caption!.length).toBeLessThanOrEqual(200);
    expect(notes).toEqual(['Alternativtext: länger als 150 Zeichen, gekürzt.', 'Bildunterschrift: länger als 200 Zeichen, gekürzt.']);
  });
});

describe('Helfer', () => {
  it('cleanValue, clipWords, normalizeKeywords', () => {
    expect(cleanValue('  "Titel"  ')).toBe('Titel');
    expect(cleanValue('»Titel«')).toBe('Titel');
    expect(cleanValue('„Er sagte „ja“ und ging“')).toBe('„Er sagte „ja“ und ging“'); // innere Zitate bleiben
    expect(cleanValue('   ')).toBeNull();
    expect(clipWords('Geschichte & Kultur der Neuzeit', 20)).toBe('Geschichte & Kultur');
    expect(clipWords('Kurz', 30)).toBe('Kurz');
    expect(normalizeKeywords('a; b\nA, c')).toBe('a, b, c');
    expect(normalizeKeywords(null)).toBeNull();
  });

  it('imageBase64 und base64Bytes', () => {
    expect(imageBase64('data:image/png;base64,AA BB\n==')).toBe('AABB==');
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Bytes('AAA=')).toBe(2);
    expect(base64Bytes('AA==')).toBe(1);
  });

  it('newsTextLength zählt reinen Text aus Titel, Teaser, Text und Information', () => {
    expect(newsTextLength(req({ title: 'T', bodytext_html: '<p>abc</p>', teaser: null, information_html: '<p>de</p>' }))).toBe('T abc de'.length);
  });
});
