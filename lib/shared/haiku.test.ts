import { describe, it, expect } from 'vitest';
import {
  checkHaikuStructure,
  isStructurallyValidHaiku,
  splitHaiku,
  HAIKU_PATTERN,
  HAIKU_SEPARATOR,
  isUmlautDigraphWord,
  joinHaikuLines,
} from './haiku';

const codes = (raw: unknown) => checkHaikuStructure(raw).map((i) => i.code);

describe('checkHaikuStructure', () => {
  it('accepts a well-formed haiku', () => {
    expect(codes('Gletscher schmelzen fort / das Meer steigt Millimeter / und jedes Jahr mehr')).toEqual([]);
  });

  it('accepts the sentence marks that survive sanitizeText', () => {
    expect(codes('Wer bleibt und wer geht / die Stadt verdrängt die Leute, ja / wer misst diesen Druck?')).toEqual([]);
  });

  it('rejects a missing or empty haiku', () => {
    expect(codes(null)).toEqual(['empty']);
    expect(codes('')).toEqual(['empty']);
    expect(codes('   ')).toEqual(['empty']);
  });

  it('rejects the wrong number of lines', () => {
    expect(codes('nur zwei Zeilen / mehr nicht')).toEqual(['separator']);
    expect(codes('eins / zwei / drei / vier')).toEqual(['separator']);
  });

  it('rejects a separator that is not exactly " / "', () => {
    // Two slashes, but glued to the words — the split would silently yield one line.
    expect(codes('eins/zwei/drei')).toEqual(['separator']);
    expect(codes('eins /zwei/ drei')).toEqual(['separator']);
  });

  it('rejects digits, because no syllable counter can pronounce them', () => {
    expect(codes('Im Jahr 1975 / geschah etwas Merkwürdiges / niemand sah es an')).toContain('forbidden_char');
  });

  it('rejects quotes and dashes', () => {
    expect(codes('Er sagte "nein" / und ging danach aus dem Raum / die Tür blieb offen')).toContain('forbidden_char');
    expect(codes('Ein Strich zu viel — / er steht hier ganz ohne Not / und bricht die Regel')).toContain('forbidden_char');
  });

  it('rejects ae/oe/ue written for an umlaut', () => {
    expect(codes('Der Baer im Wald / er sucht sich einen Unterschlupf / der Winter wird kalt')).toContain('umlaut_digraph');
    expect(codes('Ueber dem Tal / zieht ein einzelner Vogel / der Abend wird still')).toContain('umlaut_digraph');
  });

  it('does not mistake legitimate vowel clusters for umlaut spellings', () => {
    // `Quelle` (ue after q), `neue`/`Treue` (ue inside a vowel cluster).
    expect(codes('Die neue Quelle / sie speist die alte Treue / das Wasser bleibt klar')).toEqual([]);
  });

  it('spares the handful of German words where the digraph is genuine', () => {
    expect(codes('Ein Aerosol zieht / die Poesie einer Oboe / der Abend wird still')).toEqual([]);
  });

  it('spares the genuine letter contexts but still catches the umlaut words beside them', () => {
    for (const w of ['aktuell', 'virtuellen', 'Kongruenz', 'Duett', 'Statue', 'Formicidae', 'Raphael', 'Samuel']) {
      expect(isUmlautDigraphWord(w), w).toBe(false);
    }
    for (const w of ['Ueber', 'Baer', 'Fuelle', 'Muenze', 'Huette', 'schoen']) {
      expect(isUmlautDigraphWord(w), w).toBe(true);
    }
  });

  it('flags stray whitespace', () => {
    expect(codes('eins  zwei drei / vier fünf sechs sieben acht / neun zehn elf zwölf')).toContain('whitespace');
    expect(codes(' eins zwei drei / vier fünf sechs sieben acht / neun zehn elf zwölf')).toContain('whitespace');
  });

  it('reports the line a problem belongs to', () => {
    const issues = checkHaikuStructure('alles gut hier / aber 42 stört / und hier ist Ruhe');
    expect(issues[0].line).toBe(2);
  });
});

describe('joinHaikuLines', () => {
  it('macht aus drei Zeilen die gespeicherte Form (Erstversuch von Opus, lokaler Lauf 2026-10-27)', () => {
    const raw = 'Brücke aus Falten\nzwischen gestern und heute,\nWeisheit oder List';
    expect(joinHaikuLines(raw)).toBe('Brücke aus Falten / zwischen gestern und heute, / Weisheit oder List');
    expect(isStructurallyValidHaiku(joinHaikuLines(raw))).toBe(true);
  });

  it('übergeht leere Zeilen, Windows-Umbrüche und Ränder', () => {
    expect(joinHaikuLines('  eins  \r\n\r\nzwei\n drei \n')).toBe('eins / zwei / drei');
  });

  it('lässt Text mit gesetztem Trenner oder ohne Umbruch unverändert', () => {
    expect(joinHaikuLines('eins / zwei /\ndrei')).toBe('eins / zwei /\ndrei');
    expect(joinHaikuLines('eins / zwei / drei')).toBe('eins / zwei / drei');
  });
});

describe('splitHaiku', () => {
  it('returns the three lines', () => {
    expect(splitHaiku('a / b / c')).toEqual(['a', 'b', 'c']);
  });
  it('returns null when the separator is wrong', () => {
    expect(splitHaiku('a / b')).toBeNull();
  });
});

describe('isStructurallyValidHaiku', () => {
  it('narrows to string on success', () => {
    expect(isStructurallyValidHaiku('eins zwei drei / vier fünf sechs sieben acht / neun zehn elf zwölf')).toBe(true);
    expect(isStructurallyValidHaiku(42)).toBe(false);
  });
});

describe('constants', () => {
  it('pins the classical form and separator', () => {
    expect(HAIKU_PATTERN).toEqual([5, 7, 5]);
    expect(HAIKU_SEPARATOR).toBe(' / ');
  });
});
