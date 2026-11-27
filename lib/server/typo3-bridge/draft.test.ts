import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { message, mockClient, OUTPUT, SOURCE, WWWT1_SOURCES } from './test-fixtures';
import { buildDraftUserMessage, DRAFT_SYSTEM_PROMPT } from './draft-prompt';
import {
  clipAtWord,
  DRAFT_EFFORT,
  DRAFT_MODEL,
  DraftRefusedError,
  DraftUnusableError,
  finalizeDraft,
  generateDraft,
  sanitizeDraftHtml,
  sourceHashOf,
} from './draft';

// Entwurf ohne echten Claude-Aufruf: der SDK-Client ist ein Mock, der eine
// fertige Nachricht liefert. Geprüft werden Request-Form, stop_reason-
// Behandlung und die Nachbearbeitung (Termin aus den Quelldaten, HTML-
// Allowlist, Längengrenzen, Hinweise).

describe('generateDraft', () => {
  it('ruft Opus 5.5 mit Effort high, Structured Output und dem Quelltext auf', async () => {
    const { client, stream } = mockClient(message());
    await generateDraft(SOURCE, 'Bitte kürzer.', client);

    expect(stream).toHaveBeenCalledOnce();
    const params = (stream.mock.calls[0] as unknown[])[0] as Anthropic.MessageCreateParams;
    expect(params.model).toBe('claude-opus-5-5');
    expect(DRAFT_MODEL).toBe('claude-opus-5-5');
    expect(params.output_config?.effort).toBe(DRAFT_EFFORT);
    expect(params.output_config?.format?.type).toBe('json_schema');
    // Kein temperature (seit API-Version 2026-10-21 ein 400) und kein Thinking-Schalter.
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    const user = params.messages[0]?.content as string;
    expect(user).toContain('Festsaal der ÖAW, Dr. Ignaz Seipel-Platz 2, 1010 Wien');
    expect(user).toContain('<wunsch>\nBitte kürzer.\n</wunsch>');
  });

  it('übernimmt Beginn und Ende aus den Quelldaten und meldet das fehlende Ende', async () => {
    const { client } = mockClient(message());
    const res = await generateDraft(SOURCE, null, client);
    expect(res.draft.event_start).toBe('2026-12-16T17:00:00Z');
    expect(res.draft.event_end).toBeNull();
    expect(res.notes).toContain('Das Ende der Veranstaltung fehlt in den Quelldaten.');
    expect(res.model).toBe('claude-opus-5-5');
    expect(res.usage).toEqual({ promptTokens: 1200, completionTokens: 900 });
  });

  it('wirft DraftRefusedError bei stop_reason refusal, bevor es den Inhalt liest', async () => {
    const { client } = mockClient(
      message({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: null } as Anthropic.Message['stop_details'],
        parsed_output: null,
      }),
    );
    await expect(generateDraft(SOURCE, null, client)).rejects.toBeInstanceOf(DraftRefusedError);
  });

  it('wirft DraftUnusableError bei max_tokens und ohne parsed_output', async () => {
    await expect(generateDraft(SOURCE, null, mockClient(message({ stop_reason: 'max_tokens' })).client)).rejects.toBeInstanceOf(
      DraftUnusableError,
    );
    await expect(generateDraft(SOURCE, null, mockClient(message({ parsed_output: null })).client)).rejects.toBeInstanceOf(
      DraftUnusableError,
    );
  });

  it('reicht SDK-Fehler unverändert weiter (die Route bildet sie ab)', async () => {
    const boom = new Error('sdk');
    const { client } = mockClient(async () => {
      throw boom;
    });
    await expect(generateDraft(SOURCE, null, client)).rejects.toBe(boom);
  });
});

describe('finalizeDraft', () => {
  it('lässt im Fließtext nur das erlaubte HTML stehen', () => {
    const html = sanitizeDraftHtml(
      '<h2>Titel</h2><p class="x" style="color:red">Text <b>fett</b> <strong>stark</strong> <a href="https://oeaw.ac.at" target="_blank">Link</a> <a href="javascript:alert(1)">böse</a></p><script>x()</script><p> </p><img src="a.png">',
    );
    expect(html).toBe(
      '<h3>Titel</h3><p>Text <strong>fett</strong> <strong>stark</strong> <a href="https://oeaw.ac.at">Link</a> böse</p>',
    );
  });

  it('kürzt zu lange SEO-Beschreibung und alternativen Titel an einer Wortgrenze, mit Hinweis', () => {
    const long = 'Wort '.repeat(60).trim();
    const { draft, notes } = finalizeDraft({ ...OUTPUT, seo_description: long, alternative_title: long }, SOURCE);
    expect(draft.seo_description.length).toBeLessThanOrEqual(160);
    expect(draft.seo_description.endsWith('…')).toBe(true);
    expect(draft.alternative_title!.length).toBeLessThanOrEqual(60);
    expect(notes.some((n) => n.includes('SEO-Beschreibung'))).toBe(true);
    expect(notes.some((n) => n.includes('alternative Titel'))).toBe(true);
  });

  it('macht leere Textfelder zu null, nimmt das Ende aus der Quelle und meldet Gedankenstriche', () => {
    const { draft, notes } = finalizeDraft(
      { ...OUTPUT, location: '  ', speaker: '', teaser: 'Ein Abend — mit Gespräch.' },
      { ...SOURCE, eventEndAt: '2026-12-16 19:00:00+00' },
    );
    expect(draft.location).toBeNull();
    expect(draft.speaker).toBeNull();
    expect(draft.event_end).toBe('2026-12-16T19:00:00Z');
    expect(notes).not.toContain('Das Ende der Veranstaltung fehlt in den Quelldaten.');
    expect(notes.some((n) => n.includes('Gedankenstrich'))).toBe(true);
  });

  it('fällt beim leeren Titel auf den Originaltitel zurück', () => {
    expect(finalizeDraft({ ...OUTPUT, title: ' ' }, SOURCE).draft.title).toBe(SOURCE.title);
  });
});

describe('Prompt und Quell-Hash', () => {
  it('zeigt Termin in Wiener Zeit, markiert leere Felder und lässt den Wunsch ohne Angabe weg', () => {
    const user = buildDraftUserMessage(SOURCE, null);
    expect(user).toContain('Beginn: Mittwoch, 16. Dezember 2026 um 18:00 Uhr (Wiener Zeit; UTC 2026-12-16T17:00:00Z)');
    expect(user).toContain('Ende: (leer)');
    expect(user).not.toContain('<wunsch>');
    // t3://-Links fallen schon im Prompt weg, das Modell kann sie nicht übernehmen.
    expect(user).not.toContain('t3://');
  });

  it('ändert den Hash, sobald sich Quelldaten ändern, und nur dann', () => {
    const a = sourceHashOf(SOURCE);
    expect(sourceHashOf({ ...SOURCE })).toBe(a);
    expect(sourceHashOf({ ...SOURCE, title: 'Neu' })).not.toBe(a);
    expect(sourceHashOf({ ...SOURCE, eventAt: '2026-12-16 18:00:00+00' })).not.toBe(a);
  });

});

describe('Entwurf aus Eckdaten (wwwt1-Fixture)', () => {
  const [prdm9, , tba] = WWWT1_SOURCES;

  it('gibt Eckdaten als eigenen Block statt als Fließtext, bereinigt', () => {
    const user = buildDraftUserMessage(prdm9!, null);
    expect(user).toContain(
      '<eckdaten>\nDate: 2026-12-01\nTime: 11:30\nSpeaker: Linda Odenthal-Hesse\nLocation: Max Perutz Labs SR 1 (6.501)\nType: SFB "Meiosis" Talk\nInstitute: Max-Planck-Institut für Evolutionsbiologie\nHost: Irene Thiemann-Boege\n</eckdaten>',
    );
    expect(user).not.toContain('<fliesstext>');
    expect(user).not.toContain(',,');
    // Der Termin kommt weiter aus event_at.
    expect(user).toContain('Beginn: Dienstag, 1. Dezember 2026 um 11:30 Uhr');
  });

  it('nennt den Platzhaltertitel unverändert; der Prompt regelt ihn', () => {
    expect(tba!.title).toBe('Title to be announced');
    expect(buildDraftUserMessage(tba!, null)).toContain('Titel: Title to be announced');
    expect(DRAFT_SYSTEM_PROMPT).toContain('Ist der Titel ein Platzhalter („Title to be announced"');
    expect(DRAFT_SYSTEM_PROMPT).toContain('Über den Titel hinaus erfindest du nichts zum Inhalt');
    expect(DRAFT_SYSTEM_PROMPT).toContain('Institute: meist die Institution, von der die vortragende Person kommt, nicht der Veranstalter');
  });

  it('läuft mit gemocktem Client durch: Hinweise zu Abstract und Titel bleiben erhalten', async () => {
    const out = {
      ...OUTPUT,
      title: 'SFB "Meiosis" Talk: Chloe Girard',
      teaser: 'Chloe Girard (Université Paris-Saclay) spricht in der SFB-Reihe „Meiosis".',
      bodytext_html: '<p>Chloe Girard von der Université Paris-Saclay hält einen Vortrag in der Reihe SFB „Meiosis". Gastgeber ist Joao Matos.</p>',
      speaker: 'Chloe Girard',
      location: 'Max Perutz Labs SR 1 (6.501)',
      organizer: 'GMI',
      notes: ['Vortragstitel und Abstract fehlen noch.'],
    };
    const { client, stream } = mockClient(message({ parsed_output: out }));
    const res = await generateDraft(tba!, null, client);
    const user = ((stream.mock.calls[0] as unknown[])[0] as Anthropic.MessageCreateParams).messages[0]!.content as string;
    expect(user).toContain('Speaker: Chloe Girard');
    expect(res.draft.title).toBe('SFB "Meiosis" Talk: Chloe Girard');
    expect(res.draft.event_start).toBe('2027-01-19T10:30:00Z');
    expect(res.notes).toContain('Vortragstitel und Abstract fehlen noch.');
  });

  it('Veranstalter = vortragende Person: geht leer hinein, die Person bleibt unter Speaker', () => {
    // Alle drei wwwt1-Events haben organizer_simple = Speaker (wie Prod bei GMI).
    for (const src of WWWT1_SOURCES) {
      const user = buildDraftUserMessage(src, null);
      expect(user).toContain('Veranstalter (strukturiert): (leer)');
      expect(user).toContain('Institut (strukturiert): GMI');
    }
    expect(buildDraftUserMessage(prdm9!, null)).toContain('Speaker: Linda Odenthal-Hesse');
  });

  it('echter Veranstalter neben Eckdaten bleibt stehen; ohne Eckdaten wird nie verglichen', () => {
    expect(buildDraftUserMessage({ ...prdm9!, organizerTitle: 'Max Perutz Labs' }, null)).toContain('Veranstalter (strukturiert): Max Perutz Labs');
    // Fließtext: auch wenn der Name im Text vorkommt, bleibt das Feld unangetastet.
    expect(buildDraftUserMessage({ ...SOURCE, organizerTitle: 'Linda Odenthal-Hesse', bodytext: '<p>Speaker: Linda Odenthal-Hesse</p>' }, null)).toContain(
      'Veranstalter (strukturiert): Linda Odenthal-Hesse',
    );
  });

  it('der Hash reagiert auf die Eckdaten wie auf jeden Fließtext', () => {
    expect(sourceHashOf(prdm9!)).not.toBe(sourceHashOf({ ...prdm9!, bodytext: prdm9!.bodytext!.replace('11:30:00', '12:00:00') }));
  });
});

describe('clipAtWord', () => {
  it('lässt kurze Texte stehen', () => {
    expect(clipAtWord('kurz', 10)).toBe('kurz');
  });
});
