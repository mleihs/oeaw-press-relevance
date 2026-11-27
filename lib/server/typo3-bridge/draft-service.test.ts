import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDraft, sourceHashOf } from './draft';
import type { DraftSource } from './draft-prompt';
import { getOrCreateDraft, readStoredDraft, STALE_SOURCE_NOTE, type DraftDeps } from './draft-service';
import type { NewDraftRow, StoredDraft } from './draft-store';
import { message, mockClient, SOURCE } from './test-fixtures';

// Entwurfs-Cache: wann ein gespeicherter Entwurf zurückkommt und wann Claude
// (hier: ein gemockter SDK-Client) neu schreibt. Die DB ist ein Speicher im
// Arbeitsspeicher; der Ablauf ist derselbe wie in der Route.

function setup(source: DraftSource | null = SOURCE) {
  const { client, stream } = mockClient(message());
  const store = new Map<string, StoredDraft>();
  const saved: NewDraftRow[] = [];
  let clock = 0;
  const deps: DraftDeps = {
    loadSource: vi.fn(async () => source),
    loadStored: vi.fn(async (id: string) => store.get(id) ?? null),
    generate: vi.fn((s: DraftSource, instructions: string | null) => generateDraft(s, instructions, client)),
    costOf: vi.fn(async () => 0.0123),
    save: vi.fn(async (row: NewDraftRow) => {
      saved.push(row);
      const generatedAt = `2026-11-27T10:00:0${clock++}Z`;
      store.set(row.eventId, {
        draft: row.generated.draft,
        notes: row.generated.notes,
        model: row.generated.model,
        instructions: row.instructions,
        sourceHash: row.sourceHash,
        generatedAt,
      });
      return generatedAt;
    }),
  };
  return { deps, stream, store, saved };
}

const ID = SOURCE.id;

describe('getOrCreateDraft', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('schreibt beim ersten Mal neu, speichert und meldet cached: false', async () => {
    const res = await getOrCreateDraft(ID, {}, t.deps);
    expect(res?.cached).toBe(false);
    expect(res?.model).toBe('claude-opus-5-5');
    expect(res?.generated_at).toBe('2026-11-27T10:00:00Z');
    expect(res?.draft.title).toContain('Herfried Münkler');
    expect(t.stream).toHaveBeenCalledOnce();
    expect(t.saved).toHaveLength(1);
    expect(t.saved[0]).toMatchObject({ eventId: ID, webdbUid: 40455, instructions: null, costUsd: 0.0123 });
    expect(t.saved[0]?.sourceHash).toBe(sourceHashOf(SOURCE));
  });

  it('gibt beim zweiten Mal ohne refresh den gespeicherten Entwurf zurück, ohne Claude', async () => {
    const first = await getOrCreateDraft(ID, {}, t.deps);
    const second = await getOrCreateDraft(ID, { refresh: false }, t.deps);
    expect(second).toEqual({ ...first, cached: true });
    expect(t.stream).toHaveBeenCalledOnce();
  });

  it('schreibt mit refresh: true neu und überschreibt den gespeicherten', async () => {
    await getOrCreateDraft(ID, {}, t.deps);
    const res = await getOrCreateDraft(ID, { refresh: true }, t.deps);
    expect(res?.cached).toBe(false);
    expect(res?.generated_at).toBe('2026-11-27T10:00:01Z');
    expect(t.stream).toHaveBeenCalledTimes(2);
  });

  it('schreibt neu, wenn ein abweichender Zusatzwunsch ohne refresh kommt', async () => {
    await getOrCreateDraft(ID, {}, t.deps);
    const res = await getOrCreateDraft(ID, { instructions: '  Bitte auf Englisch.  ' }, t.deps);
    expect(res?.cached).toBe(false);
    expect(t.saved[1]?.instructions).toBe('Bitte auf Englisch.');
    const user = (t.stream.mock.calls[1] as unknown as [{ messages: { content: string }[] }])[0].messages[0]!.content;
    expect(user).toContain('Bitte auf Englisch.');
  });

  it('nimmt den gespeicherten bei gleichem Wunsch oder ohne Wunsch', async () => {
    await getOrCreateDraft(ID, { instructions: 'Kürzer.' }, t.deps);
    expect((await getOrCreateDraft(ID, { instructions: 'Kürzer.' }, t.deps))?.cached).toBe(true);
    expect((await getOrCreateDraft(ID, { instructions: '   ' }, t.deps))?.cached).toBe(true);
    expect(t.stream).toHaveBeenCalledOnce();
  });

  it('weist beim gespeicherten Entwurf auf geänderte Quelldaten hin, ohne neu zu schreiben', async () => {
    await getOrCreateDraft(ID, {}, t.deps);
    vi.mocked(t.deps.loadSource).mockResolvedValueOnce({ ...SOURCE, title: 'Geänderter Titel' });
    const res = await getOrCreateDraft(ID, {}, t.deps);
    expect(res?.cached).toBe(true);
    expect(res?.notes).toContain(STALE_SOURCE_NOTE);
    expect(t.stream).toHaveBeenCalledOnce();
  });

  it('gibt null für ein unbekanntes Event und ruft Claude nicht', async () => {
    const u = setup(null);
    expect(await getOrCreateDraft(ID, { refresh: true }, u.deps)).toBeNull();
    expect(u.stream).not.toHaveBeenCalled();
    expect(u.deps.loadStored).not.toHaveBeenCalled();
  });

  it('speichert nichts, wenn Claude scheitert', async () => {
    const failing = setup();
    vi.mocked(failing.deps.generate).mockRejectedValueOnce(new Error('weg'));
    await expect(getOrCreateDraft(ID, {}, failing.deps)).rejects.toThrow('weg');
    expect(failing.saved).toHaveLength(0);
  });
});

describe('readStoredDraft (GET)', () => {
  it('liefert den gespeicherten Entwurf als cached, ohne Claude', async () => {
    const t = setup();
    const created = await getOrCreateDraft(ID, {}, t.deps);
    const read = await readStoredDraft(ID, t.deps);
    expect(read).toEqual({ draft: { ...created, cached: true } });
    expect(t.stream).toHaveBeenCalledOnce();
  });

  it('meldet „noch kein Entwurf" und ruft dabei nie Claude', async () => {
    const t = setup();
    expect(await readStoredDraft(ID, t.deps)).toEqual({ draft: null });
    expect(t.deps.generate).not.toHaveBeenCalled();
    expect(t.deps.save).not.toHaveBeenCalled();
  });

  it('weist auch beim Lesen auf geänderte Quelldaten hin', async () => {
    const t = setup();
    await getOrCreateDraft(ID, {}, t.deps);
    vi.mocked(t.deps.loadSource).mockResolvedValueOnce({ ...SOURCE, teaser: 'Neuer Teaser' });
    expect((await readStoredDraft(ID, t.deps))?.draft?.notes).toContain(STALE_SOURCE_NOTE);
  });

  it('gibt null für ein unbekanntes Event', async () => {
    const u = setup(null);
    expect(await readStoredDraft(ID, u.deps)).toBeNull();
    expect(u.deps.loadStored).not.toHaveBeenCalled();
  });
});
