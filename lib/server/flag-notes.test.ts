import { describe, it, expect } from 'vitest';
import { setFlagNote, clearFlagNote, type FlagNoteStore } from './flag-notes';
import type { FlagNote } from '@/lib/shared/types';

// In-memory store: exercises the engine's dedup/defaultBy/trim/not-found logic
// without any DB. `undefined` initial = a missing entity (→ notFound).
class NotFoundError extends Error {}

function memStore(initial: FlagNote[] | undefined) {
  let notes = initial;
  const store: FlagNoteStore = {
    readNotes: async () => notes,
    writeNotes: async (n) => {
      notes = n;
    },
    notFound: () => new NotFoundError(),
  };
  return { store, current: () => notes };
}

describe('setFlagNote', () => {
  it('adds a note with by/note/timestamp on a fresh entity', async () => {
    const { store, current } = memStore([]);
    const next = await setFlagNote(store, { by: 'Marie', note: 'check this' });

    expect(next).toHaveLength(1);
    expect(next[0].by).toBe('Marie');
    expect(next[0].note).toBe('check this');
    expect(typeof next[0].at).toBe('string');
    expect(Number.isNaN(Date.parse(next[0].at))).toBe(false);
    expect(current()).toEqual(next); // persisted via writeNotes
  });

  it('defaults empty/missing reviewer to "team"', async () => {
    const { store } = memStore([]);
    expect((await setFlagNote(store, { by: '   ', note: 'x' }))[0].by).toBe('team');

    const { store: store2 } = memStore([]);
    expect((await setFlagNote(store2, { by: null, note: 'x' }))[0].by).toBe('team');
  });

  it('trims the note text', async () => {
    const { store } = memStore([]);
    const next = await setFlagNote(store, { by: 'a', note: '  spaced  ' });
    expect(next[0].note).toBe('spaced');
  });

  it('treats a missing note as an empty string', async () => {
    const { store } = memStore([]);
    const next = await setFlagNote(store, { by: 'a' });
    expect(next[0].note).toBe('');
  });

  it('overwrites the same reviewer instead of stacking (case/space-insensitive)', async () => {
    const { store } = memStore([]);
    await setFlagNote(store, { by: 'Marie', note: 'first' });
    const next = await setFlagNote(store, { by: '  marie ', note: 'second' });

    expect(next).toHaveLength(1);
    expect(next[0].note).toBe('second');
    expect(next[0].by).toBe('marie'); // defaultBy trims; dedup additionally lowercases
  });

  it('keeps notes from different reviewers', async () => {
    const { store } = memStore([]);
    await setFlagNote(store, { by: 'Marie', note: 'a' });
    const next = await setFlagNote(store, { by: 'Tom', note: 'b' });

    expect(next).toHaveLength(2);
    expect(next.map((n) => n.note)).toEqual(['a', 'b']);
  });

  it('throws the store error when the entity does not exist', async () => {
    const { store } = memStore(undefined);
    await expect(setFlagNote(store, { by: 'a', note: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('clearFlagNote', () => {
  it('removes only the calling reviewer (normalized match)', async () => {
    const existing: FlagNote[] = [
      { by: 'Marie', note: 'a', at: '2026-01-01T00:00:00.000Z' },
      { by: 'Tom', note: 'b', at: '2026-01-01T00:00:00.000Z' },
    ];
    const { store, current } = memStore(existing);
    const next = await clearFlagNote(store, { by: ' MARIE ' });

    expect(next).toHaveLength(1);
    expect(next[0].by).toBe('Tom');
    expect(current()).toEqual(next);
  });

  it('is a no-op when the reviewer had not flagged', async () => {
    const existing: FlagNote[] = [{ by: 'Tom', note: 'b', at: '2026-01-01T00:00:00.000Z' }];
    const { store } = memStore(existing);
    const next = await clearFlagNote(store, { by: 'Marie' });

    expect(next).toEqual(existing);
  });

  it('throws the store error when the entity does not exist', async () => {
    const { store } = memStore(undefined);
    await expect(clearFlagNote(store, { by: 'a' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
