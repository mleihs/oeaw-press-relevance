import { describe, it, expect } from 'vitest';
import {
  angleFormOf,
  emptyRunMemory,
  MEMORY_CLOSINGS_MAX,
  readLektoratChanges,
  rememberChunk,
  type LektoratItem,
} from './lektorat';
import { buildLektoratSystemPrompt, buildLektoratUserPrompt } from './lektorat-prompt';
import { PITCH_STYLE_RULES } from '@/lib/server/analysis/prompts';
import { EVENT_TEXT_RULES } from '@/lib/server/events/prompts';

const texts = (pitch: string) => ({
  pitch_suggestion: pitch,
  suggested_angle: 'Winkel als Aussage.',
  target_audience: 'ORF Wissenschaft, Der Standard',
  reasoning: 'Begründung.',
});
const items: LektoratItem[] = [
  { id: 'a', title: 'A', content: 'Quelle A', texts: texts('Ein kurzer Pitch.') },
  { id: 'b', title: 'B', content: 'Quelle B', texts: texts('Noch ein Pitch.') },
];

describe('readLektoratChanges', () => {
  it('übernimmt nur geänderte Textfelder bekannter Nummern, bereinigt', () => {
    const { changes, rejected } = readLektoratChanges(
      {
        changes: [
          { nr: 2, pitch_suggestion: '  Ein <b>besserer</b> Pitch.  ', suggested_angle: 'Winkel als Aussage.' },
          { nr: 1, public_accessibility: 0.9, haiku: 'drei / zeilen / hier' },
          { nr: 7, pitch_suggestion: 'gibt es nicht' },
        ],
      },
      items,
    );
    expect(changes).toEqual([{ id: 'b', texts: { pitch_suggestion: 'Ein besserer Pitch.' } }]);
    expect(rejected).toEqual([]);
  });

  it('verwirft leere und ausufernde Texte mit Grund', () => {
    const { changes, rejected } = readLektoratChanges(
      { changes: [{ nr: 1, reasoning: '   ', pitch_suggestion: 'x'.repeat(200) }] },
      items,
    );
    expect(changes).toEqual([]);
    expect(rejected.map((r) => [r.id, r.field])).toEqual([
      ['a', 'pitch_suggestion'],
      ['a', 'reasoning'],
    ]);
  });

  it('liefert nichts bei einer Antwort ohne changes-Liste', () => {
    expect(readLektoratChanges({ foo: 1 }, items)).toEqual({ changes: [], rejected: [] });
    expect(readLektoratChanges(null, items)).toEqual({ changes: [], rejected: [] });
  });
});

describe('Laufgedächtnis', () => {
  it('erkennt die Winkel-Formen', () => {
    expect(angleFormOf('Warum wandern Vögel?')).toBe('frage');
    expect(angleFormOf('Klimawandel: Wie Wälder reagieren.')).toBe('doppelpunkt');
    expect(angleFormOf('Wälder reagieren schneller als gedacht.')).toBe('aussage');
  });

  it('merkt sich Schluss-Bigramme je Feld ohne Dubletten und deckelt die Liste', () => {
    const memory = emptyRunMemory();
    rememberChunk(memory, [
      { ...texts('Erster Satz. Das Ende naht.'), suggested_angle: 'Frage?' },
      { ...texts('Zweiter Satz. Das Ende naht.'), suggested_angle: 'Stichwort: Satz.' },
    ]);
    expect(memory.closings.pitch_suggestion).toEqual(['ende naht']);
    expect(memory.closings.target_audience).toBeUndefined();
    expect(memory.angleForms).toEqual({ aussage: 0, frage: 1, doppelpunkt: 1 });

    const many = Array.from({ length: MEMORY_CLOSINGS_MAX + 5 }, (_, i) => texts(`Satz endet mit wort${i}.`));
    rememberChunk(memory, many);
    expect(memory.closings.pitch_suggestion).toHaveLength(MEMORY_CLOSINGS_MAX);
    expect(memory.closings.pitch_suggestion?.at(-1)).toBe(`mit wort${MEMORY_CLOSINGS_MAX + 4}`);
  });
});

describe('Lektorat-Prompt', () => {
  it('misst an der Rubrik der jeweiligen Entität', () => {
    expect(buildLektoratSystemPrompt('publications')).toContain(PITCH_STYLE_RULES.split('\n')[0]);
    expect(buildLektoratSystemPrompt('events')).toContain(EVENT_TEXT_RULES);
    expect(buildLektoratSystemPrompt('events')).not.toContain('VERANKERUNG');
  });

  it('nennt Sperrliste, Winkel-Stand, Quelltext und Befunde je Text', () => {
    const memory = emptyRunMemory();
    memory.closings.reasoning = ['ende naht'];
    memory.angleForms.doppelpunkt = 3;
    const user = buildLektoratUserPrompt(
      'publications',
      [
        {
          title: 'A',
          content: 'Quelle A',
          texts: texts('Pitch A.'),
          findings: [{ id: 'a', field: 'pitch_suggestion', code: 'pitch_length', detail: '8 Zeichen (erlaubt 110 bis 1200)' }],
        },
      ],
      memory,
    );
    expect(user).toContain('- reasoning: „ende naht"');
    expect(user).toContain('3 in der Form „Stichwort: Satz"');
    expect(user).toContain('=== Text 1 ===\nTitel: A\nQuelltext: Quelle A\npitch_suggestion: Pitch A.');
    expect(user).toContain('- pitch_suggestion, Pitch-Länge: 8 Zeichen (erlaubt 110 bis 1200)');
  });

  it('sagt im ersten Stapel, dass es noch keine Sperrliste gibt', () => {
    const user = buildLektoratUserPrompt('events', [{ title: 'E', content: 'Q', texts: texts('P.'), findings: [] }], emptyRunMemory());
    expect(user).toContain('erste Stapel des Laufs');
    expect(user).toContain('Maschinelle Befunde:\n- keine');
  });
});
