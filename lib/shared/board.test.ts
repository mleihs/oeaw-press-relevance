import { describe, it, expect } from 'vitest';
import {
  CARD_TITLE_MAX,
  clampCardTitle,
  cardLocationLabel,
  cardDeepLink,
} from './board';
import { cardCreateSchema } from './board-schemas';

describe('clampCardTitle', () => {
  it('lässt kurze Titel (getrimmt) unverändert', () => {
    expect(clampCardTitle('  Kurzer Titel  ')).toBe('Kurzer Titel');
  });
  it('kürzt überlange Titel auf max. Länge inkl. Ellipse', () => {
    const long = 'x'.repeat(CARD_TITLE_MAX + 50);
    const out = clampCardTitle(long);
    expect(out.length).toBe(CARD_TITLE_MAX);
    expect(out.endsWith('…')).toBe(true);
    // Das Ergebnis passt durch cardCreateSchema (title .max(200)).
    const parsed = cardCreateSchema.safeParse({
      column_id: '11111111-1111-4111-8111-111111111111',
      title: out,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('cardLocationLabel', () => {
  it('kombiniert Board + Kanal', () => {
    expect(cardLocationLabel({ board_name: 'Channels', column_name: 'PM/Presse' })).toBe(
      'Channels · PM/Presse',
    );
  });
  it('ohne Kanal nur das Board', () => {
    expect(cardLocationLabel({ board_name: 'Channels', column_name: null })).toBe('Channels');
  });
});

describe('cardDeepLink', () => {
  it('baut den ?card=-Deep-Link mit Encoding', () => {
    expect(cardDeepLink({ board_slug: 'channels', id: 'abc' })).toBe(
      '/board/channels?card=abc',
    );
  });
});

describe('cardCreateSchema Triage-Felder', () => {
  const base = {
    column_id: '11111111-1111-4111-8111-111111111111',
    title: 'T',
  };
  const uuidA = '22222222-2222-4222-8222-222222222222';
  const uuidB = '33333333-3333-4333-8333-333333333333';

  it('akzeptiert genau eine Quelle + Checkliste', () => {
    const r = cardCreateSchema.safeParse({
      ...base,
      source_event_id: uuidA,
      items: [{ kind: 'checklist', text: 'Web-ITV' }],
    });
    expect(r.success).toBe(true);
  });
  it('lehnt zwei gleichzeitige Quellen ab', () => {
    const r = cardCreateSchema.safeParse({
      ...base,
      source_event_id: uuidA,
      source_publication_id: uuidB,
    });
    expect(r.success).toBe(false);
  });
  it('bleibt abwärtskompatibel (nur Titel + Spalte)', () => {
    expect(cardCreateSchema.safeParse(base).success).toBe(true);
  });
});
