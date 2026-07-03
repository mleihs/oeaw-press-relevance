import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, users, boards, cards } from '@/lib/server/db';
import { slugifyBoardName } from '@/lib/shared/board';
import {
  listBoards,
  createBoard,
  patchBoard,
  setBoardFavorite,
  getBoardWithColumns,
} from './boards';
import { createColumn, deleteColumn } from './columns';
import {
  createCard,
  patchCard,
  moveCard,
  getCardDetail,
  deleteCard,
} from './cards';
import { addItem, patchItem, convertItemToCard } from './items';
import { addWatcher } from './watchers';
import { listBoardMembers } from './members';
import {
  ColumnNotEmptyError,
  ItemAlreadyConvertedError,
  isUniqueViolation,
} from './errors';

/**
 * Board-Serverpfad end-to-end gegen den LOKALEN Stack. Deckt die Raw-SQL-Reads
 * (Chip-/Detail-Aggregate, search_text, converted_card_id-Lookup), Rank-
 * Vergabe, Activity-Verben, den Spalten-Löschguard und den Umwandeln-Workflow
 * ab. Läuft nur gegen die lokale Dev-DB (Port 54422) — Schutz gegen prod.
 */
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /(?:127\.0\.0\.1|localhost):54422\b/.test(dbUrl);

describe.skipIf(!isLocal)('board server lifecycle (lokaler Stack)', () => {
  it('slugifyBoardName transliteriert Umlaute und kebab-t', () => {
    expect(slugifyBoardName('Lange Nacht der Forschung 2026')).toBe(
      'lange-nacht-der-forschung-2026',
    );
    expect(slugifyBoardName('Blog GÖ / Web')).toBe('blog-goe-web');
    expect(slugifyBoardName('!!!')).toBe('board');
  });

  it('deckt create/column/card/item/patch/move/convert/favorite/guard ab', async () => {
    const [u] = await db.select().from(users).limit(1);
    expect(u, 'braucht mindestens einen Nutzer im lokalen Stack').toBeTruthy();
    const uid = u.id;

    const members = await listBoardMembers();
    expect(members.length).toBeGreaterThanOrEqual(1);

    const board = await createBoard('Smoke Test Board ÄÖÜ');
    try {
      expect(board.slug).toMatch(/^smoke-test-board-aeoeue/);

      const colA = await createColumn(board.id, 'Ideen');
      const colB = await createColumn(board.id, 'In Arbeit', '#0d9488');
      expect(colB.color).toBe('#0d9488');
      expect(colA.rank < colB.rank).toBe(true);

      const card = await createCard(uid, {
        column_id: colA.id,
        title: 'Testkarte',
        link_url: 'https://oeaw.ac.at/x',
      });
      expect(card.search_text).toContain('testkarte');

      const it1 = await addItem({ card_id: card.id, kind: 'checklist', text: 'Fotos anfragen' });
      const it2 = await addItem({ card_id: card.id, kind: 'subtask', text: 'Folge 12: Meroë' });
      await patchItem(uid, it1.id, { done: true });

      const d1 = await getCardDetail(card.id);
      expect(d1.checklist_total).toBe(1);
      expect(d1.checklist_done).toBe(1);
      expect(d1.subtask_total).toBe(1);
      expect(d1.subtask_done).toBe(0);
      expect(d1.activity.map((a) => a.verb)).toEqual(
        expect.arrayContaining(['created', 'item_checked']),
      );

      const p = await patchCard(uid, card.id, {
        due_at: '2026-07-08',
        assignee_id: uid,
        completed: true,
      });
      expect(p.completed_at).not.toBeNull();
      expect(p.assignee_id).toBe(uid);
      expect(p.activity.map((a) => a.verb)).toEqual(
        expect.arrayContaining(['completed', 'due_set', 'assignee_set']),
      );

      await addWatcher(card.id, uid);
      const mv = await moveCard(uid, card.id, colB.id);
      expect(mv.column_id).toBe(colB.id);
      expect(mv.watcher_ids).toContain(uid);
      expect(mv.activity.map((a) => a.verb)).toContain('moved');

      const conv = await convertItemToCard(uid, it2.id, {
        column_id: colA.id,
        due_at: '2026-08-01',
      });
      expect(conv.title).toBe('Folge 12: Meroë');
      expect(conv.converted_from_item_id).toBe(it2.id);
      expect(conv.activity.map((a) => a.verb)).toContain('created_from_subtask');

      const src = await getCardDetail(card.id);
      expect(src.items.find((i) => i.id === it2.id)?.converted_card_id).toBe(conv.id);

      const full = await getBoardWithColumns(uid, board.slug);
      expect(full.columns).toHaveLength(2);
      expect(full.cards).toHaveLength(2);
      expect(full.board.card_count).toBe(2);

      await setBoardFavorite(uid, board.id, true);
      const b = (await listBoards(uid)).find((x) => x.id === board.id);
      expect(b?.is_favorite).toBe(true);
      expect(b?.last_activity_at).not.toBeNull();

      await expect(deleteColumn(colA.id)).rejects.toBeInstanceOf(ColumnNotEmptyError);

      const archived = await patchBoard(uid, board.id, { archived: true });
      expect(archived.archived_at).not.toBeNull();

      await deleteCard(card.id);
      await deleteCard(conv.id);
      await deleteColumn(colA.id);
      await deleteColumn(colB.id);
    } finally {
      // Aufräumen, auch wenn eine Assertion oben scheitert.
      await db.delete(boards).where(eq(boards.id, board.id));
    }
  });

  // Regressionen aus dem Phase-2-Code-Review (Fable).
  it('isUniqueViolation erkennt den in DrizzleQueryError gewrappten 23505', async () => {
    // Echter Duplicate-Insert (slug 'channels' ist geseedet) durch Drizzle.
    let caught: unknown;
    try {
      await db.insert(boards).values({ name: 'Dup', slug: 'channels', rank: 'n' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(isUniqueViolation(caught)).toBe(true);
  });

  it('createBoard dedupt kollidierende Slugs (-2), der Retry-Loop greift', async () => {
    const a = await createBoard('Slug Dup Test');
    const b = await createBoard('Slug Dup Test');
    try {
      expect(a.slug).toBe('slug-dup-test');
      expect(b.slug).toBe('slug-dup-test-2');
    } finally {
      await db.delete(boards).where(eq(boards.id, a.id));
      await db.delete(boards).where(eq(boards.id, b.id));
    }
  });

  it('convertItemToCard blockt den Doppel-Convert', async () => {
    const [u] = await db.select().from(users).limit(1);
    const board = await createBoard('Convert Guard Test');
    try {
      const col = await createColumn(board.id, 'A');
      const card = await createCard(u.id, { column_id: col.id, title: 'K' });
      const item = await addItem({ card_id: card.id, kind: 'subtask', text: 'Folge' });
      const first = await convertItemToCard(u.id, item.id, { column_id: col.id });
      await expect(
        convertItemToCard(u.id, item.id, { column_id: col.id }),
      ).rejects.toBeInstanceOf(ItemAlreadyConvertedError);
      // Nur EINE Karte referenziert das Item -> kein Join-Fan-out.
      const detail = await getCardDetail(card.id);
      const sub = detail.items.filter((i) => i.id === item.id);
      expect(sub).toHaveLength(1);
      expect(sub[0].converted_card_id).toBe(first.id);
    } finally {
      // Karten zuerst (cards.board_id ist RESTRICT), dann das Board.
      await db.delete(cards).where(eq(cards.boardId, board.id));
      await db.delete(boards).where(eq(boards.id, board.id));
    }
  });
});
