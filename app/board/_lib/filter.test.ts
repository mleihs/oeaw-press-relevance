import { describe, it, expect } from 'vitest';
import type { CardChip } from '@/lib/shared/board';
import { matchCard, personCounts, hasActiveFilters, EMPTY_FILTERS } from './filter';

function chip(over: Partial<CardChip>): CardChip {
  return {
    id: 'c', board_id: 'b', column_id: 'col1', title: 'T', link_url: null,
    rank: 'm', due_at: null, completed_at: null, assignee_id: null, watcher_ids: [],
    checklist_done: 0, checklist_total: 0, subtask_done: 0, subtask_total: 0,
    comment_count: 0, attachment_count: 0, search_text: 't',
    ...over,
  };
}
const noFirst = () => null;

describe('matchCard', () => {
  it('filtert nach Kanal', () => {
    const c = chip({ column_id: 'col1' });
    expect(matchCard(c, { ...EMPTY_FILTERS, columnId: 'col1' }, noFirst)).toBe(true);
    expect(matchCard(c, { ...EMPTY_FILTERS, columnId: 'col2' }, noFirst)).toBe(false);
  });

  it('versteckt Erledigte nur bei showCompleted=false', () => {
    const done = chip({ completed_at: '2026-07-01T00:00:00Z' });
    expect(matchCard(done, { ...EMPTY_FILTERS, showCompleted: true }, noFirst)).toBe(true);
    expect(matchCard(done, { ...EMPTY_FILTERS, showCompleted: false }, noFirst)).toBe(false);
  });

  it('onlyOverdue lässt nur überfällige offene Karten durch', () => {
    const overdue = chip({ due_at: '2020-01-01T00:00:00Z' });
    const future = chip({ due_at: '2099-01-01T00:00:00Z' });
    expect(matchCard(overdue, { ...EMPTY_FILTERS, onlyOverdue: true }, noFirst)).toBe(true);
    expect(matchCard(future, { ...EMPTY_FILTERS, onlyOverdue: true }, noFirst)).toBe(false);
  });

  it('Suche matcht search_text (Titel + Item-Texte)', () => {
    const c = chip({ search_text: 'meroë fotos anfragen' });
    expect(matchCard(c, { ...EMPTY_FILTERS, search: 'Fotos' }, noFirst)).toBe(true);
    expect(matchCard(c, { ...EMPTY_FILTERS, search: 'podcast' }, noFirst)).toBe(false);
  });

  it('Person unassigned = ohne Assignee', () => {
    expect(matchCard(chip({ assignee_id: null }), { ...EMPTY_FILTERS, personId: 'unassigned' }, noFirst)).toBe(true);
    expect(matchCard(chip({ assignee_id: 'u1' }), { ...EMPTY_FILTERS, personId: 'unassigned' }, noFirst)).toBe(false);
  });

  it('Person matcht Assignee ODER Beobachter ODER Vorname im Text', () => {
    const first = (id: string) => (id === 'u1' ? 'Christine' : null);
    expect(matchCard(chip({ assignee_id: 'u1' }), { ...EMPTY_FILTERS, personId: 'u1' }, first)).toBe(true);
    expect(matchCard(chip({ watcher_ids: ['u1'] }), { ...EMPTY_FILTERS, personId: 'u1' }, first)).toBe(true);
    expect(matchCard(chip({ search_text: 'brand christine fragt an' }), { ...EMPTY_FILTERS, personId: 'u1' }, first)).toBe(true);
    expect(matchCard(chip({ search_text: 'nichts' }), { ...EMPTY_FILTERS, personId: 'u1' }, first)).toBe(false);
  });
});

describe('personCounts', () => {
  it('zählt unassigned und pro Person', () => {
    const first = (id: string) => (id === 'u1' ? 'Christine' : null);
    const cards = [
      chip({ id: 'a', assignee_id: null }),
      chip({ id: 'b', assignee_id: 'u1' }),
      chip({ id: 'c', watcher_ids: ['u1'] }),
      chip({ id: 'd', assignee_id: null, search_text: 'christine hilft' }),
    ];
    const counts = personCounts(cards, first);
    // a, c, d haben keinen Assignee (c ist nur Beobachter) -> Zähler überlappen
    // bewusst mit dem Personen-Zähler (Design: „Nicht zugewiesen" = ohne Assignee).
    expect(counts.unassigned).toBe(3);
    expect(counts.byUser['u1']).toBe(3); // b (assignee) + c (watcher) + d (Vorname)
  });
});

describe('hasActiveFilters', () => {
  it('leerer Default ist inaktiv, showCompleted=false zählt als aktiv', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, showCompleted: false })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: 'x' })).toBe(true);
  });
});
