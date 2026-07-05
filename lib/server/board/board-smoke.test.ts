import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, users, boards, cards, events, publications } from '@/lib/server/db';
import { slugifyBoardName } from '@/lib/shared/board';
import {
  listBoards,
  createBoard,
  patchBoard,
  setBoardFavorite,
  getBoardWithColumns,
} from './boards';
import { createColumn, deleteColumn, sortColumnCards } from './columns';
import { RANK_PATTERN, compareRank } from '@/lib/shared/rank';
import {
  createCard,
  patchCard,
  moveCard,
  getCardDetail,
  deleteCard,
  archiveCompletedInColumn,
} from './cards';
import { getBoardDashboardCards, searchCards, getCardsForSource, listArchivedCards } from './queries';
import { addItem, patchItem, convertItemToCard } from './items';
import { addWatcher } from './watchers';
import { addComment, editComment, deleteComment } from './comments';
import { addAttachment } from './attachments';
import { listBoardMembers } from './members';
import {
  AttachmentRejectedError,
  BoardForbiddenError,
  ColumnNotEmptyError,
  ItemAlreadyConvertedError,
  isUniqueViolation,
} from './errors';
import { MAX_ATTACHMENT_BYTES } from '@/lib/shared/board';
import type { CurrentUser } from '@/lib/shared/types';

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

      // Markdown-Beschreibung: description_html wird server-gerendert + gesäubert.
      const withDesc = await patchCard(uid, card.id, {
        description_md: '**fett** <script>alert(1)</script>',
      });
      expect(withDesc.description_html).toContain('<strong>fett</strong>');
      expect(withDesc.description_html).not.toContain('<script');

      // Kommentar-Lebenszyklus: add -> body_html gerendert + comment_added-
      // Activity; edit (nur Urheber); Fremd-Edit verboten; delete.
      const currentUser: CurrentUser = {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role as CurrentUser['role'],
      };
      const cmt = await addComment(uid, card.id, 'Erster **Kommentar** mit [Link](https://oeaw.ac.at)');
      expect(cmt.body_html).toContain('<strong>Kommentar</strong>');
      expect(cmt.body_html).toContain('target="_blank"');

      const afterComment = await getCardDetail(card.id);
      expect(afterComment.comments.map((c) => c.id)).toContain(cmt.id);
      expect(afterComment.comment_count).toBe(1);
      expect(afterComment.activity.map((a) => a.verb)).toContain('comment_added');

      const edited = await editComment(currentUser, cmt.id, 'Korrigierter Kommentar');
      expect(edited.body_html).toContain('Korrigierter Kommentar');
      expect(edited.edited_at).not.toBeNull();

      // Fremd-Nutzer (falls vorhanden) darf den Kommentar nicht bearbeiten.
      const other = members.find((m) => m.id !== uid);
      if (other) {
        const otherUser: CurrentUser = {
          id: other.id,
          email: other.email,
          displayName: other.display_name,
          role: other.role,
        };
        await expect(editComment(otherUser, cmt.id, 'fremd')).rejects.toBeInstanceOf(
          BoardForbiddenError,
        );
      }

      await deleteComment(currentUser, cmt.id);
      const afterDelete = await getCardDetail(card.id);
      expect(afterDelete.comments).toHaveLength(0);
      expect(afterDelete.comment_count).toBe(0);

      // Anhang-Validierung: die Reject-Pfade schlagen VOR putObject fehl, also
      // wird kein echtes Objekt geschrieben (kein MinIO-Zugriff im Test).
      await expect(
        addAttachment(uid, card.id, {
          filename: 'schad.exe',
          contentType: 'application/x-msdownload',
          bytes: new ArrayBuffer(10),
        }),
      ).rejects.toBeInstanceOf(AttachmentRejectedError);
      // Extension-Fallback (leerer content-type) darf nicht blanket-akzeptieren:
      // unbekannte Endung bleibt abgelehnt.
      await expect(
        addAttachment(uid, card.id, {
          filename: 'schad.exe',
          contentType: '',
          bytes: new ArrayBuffer(10),
        }),
      ).rejects.toBeInstanceOf(AttachmentRejectedError);
      await expect(
        addAttachment(uid, card.id, {
          filename: 'gross.pdf',
          contentType: 'application/pdf',
          bytes: new ArrayBuffer(MAX_ATTACHMENT_BYTES + 1),
        }),
      ).rejects.toBeInstanceOf(AttachmentRejectedError);
      await expect(
        addAttachment(uid, card.id, {
          filename: 'leer.pdf',
          contentType: 'application/pdf',
          bytes: new ArrayBuffer(0),
        }),
      ).rejects.toBeInstanceOf(AttachmentRejectedError);

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

  it('sortColumnCards ordnet nach Fälligkeit/Titel/Erstelldatum kollisionsfrei neu', async () => {
    const [u] = await db.select().from(users).limit(1);
    const uid = u.id;
    const board = await createBoard('Sort Test Board');
    try {
      const col = await createColumn(board.id, 'Sortierspalte');
      // Bewusst in einer Reihenfolge anlegen, die weder Titel- noch
      // Fälligkeits-Sortierung entspricht (created-Reihenfolge = Anlege-Reihenfolge).
      const c1 = await createCard(uid, { column_id: col.id, title: 'Banane', due_at: '2026-07-10' });
      const c2 = await createCard(uid, { column_id: col.id, title: 'Apfel' }); // due null
      const c3 = await createCard(uid, { column_id: col.id, title: 'Clementine', due_at: '2026-07-05' });
      const c4 = await createCard(uid, { column_id: col.id, title: 'Dattel', due_at: '2026-07-20' });

      const rankOrder = async (): Promise<string[]> => {
        const rows = await db
          .select({ id: cards.id, rank: cards.rank })
          .from(cards)
          .where(eq(cards.columnId, col.id));
        // Ranks müssen gültig (rank.ts-Invariante) und eindeutig sein.
        expect(rows.every((r) => RANK_PATTERN.test(r.rank))).toBe(true);
        expect(new Set(rows.map((r) => r.rank)).size).toBe(rows.length);
        return [...rows].sort((a, b) => compareRank(a.rank, b.rank)).map((r) => r.id);
      };

      await sortColumnCards(col.id, 'due'); // asc, NULLs ans Ende
      expect(await rankOrder()).toEqual([c3.id, c1.id, c4.id, c2.id]);

      await sortColumnCards(col.id, 'title'); // Apfel, Banane, Clementine, Dattel
      expect(await rankOrder()).toEqual([c2.id, c1.id, c3.id, c4.id]);

      await sortColumnCards(col.id, 'created'); // Anlege-Reihenfolge
      expect(await rankOrder()).toEqual([c1.id, c2.id, c3.id, c4.id]);

      await deleteCard(c1.id);
      await deleteCard(c2.id);
      await deleteCard(c3.id);
      await deleteCard(c4.id);
      await deleteColumn(col.id);
    } finally {
      await db.delete(boards).where(eq(boards.id, board.id));
    }
  });

  it('Archiv: archivierte Karten fallen aus Board-Load/card_count/Suche, Restore holt sie zurück', async () => {
    const [u] = await db.select().from(users).limit(1);
    const uid = u.id;
    const board = await createBoard('Archiv Test Board');
    try {
      const col = await createColumn(board.id, 'Erledigt-Spalte');
      const done1 = await createCard(uid, { column_id: col.id, title: 'Archiv-Kandidat Alpha' });
      const done2 = await createCard(uid, { column_id: col.id, title: 'Archiv-Kandidat Beta' });
      const open = await createCard(uid, { column_id: col.id, title: 'Bleibt offen Gamma' });
      await patchCard(uid, done1.id, { completed: true });
      await patchCard(uid, done2.id, { completed: true });

      // Bulk-Archivierung erfasst nur die erledigten (nicht die offene) Karte.
      const n = await archiveCompletedInColumn(uid, col.id);
      expect(n).toBe(2);

      // Board-Load + card_count schließen archivierte Karten aus (keine
      // Geisterkarten in den Zählern).
      const full = await getBoardWithColumns(uid, board.slug);
      expect(full.cards.map((c) => c.id)).toEqual([open.id]);
      expect(full.board.card_count).toBe(1);
      const summary = (await listBoards(uid)).find((b) => b.id === board.id);
      expect(summary?.card_count).toBe(1);

      // Board-übergreifende Suche findet die archivierte Karte NICHT mehr.
      expect((await searchCards('Archiv-Kandidat Alpha')).some((c) => c.id === done1.id)).toBe(false);
      // Die offene ist weiter auffindbar.
      expect((await searchCards('Bleibt offen Gamma')).some((c) => c.id === open.id)).toBe(true);

      // Archiv-Ansicht listet beide, neueste zuerst; Detail bleibt öffenbar.
      const archived = await listArchivedCards(board.id);
      expect(archived.map((c) => c.id).sort()).toEqual([done1.id, done2.id].sort());
      expect(archived[0].column_name).toBe('Erledigt-Spalte');
      const detail = await getCardDetail(done1.id);
      expect(detail.activity.map((a) => a.verb)).toContain('archived');

      // Wiederherstellen bringt die Karte zurück ins Board (+ Activity).
      const restored = await patchCard(uid, done1.id, { archived: false });
      expect(restored.activity.map((a) => a.verb)).toContain('unarchived');
      const afterRestore = await getBoardWithColumns(uid, board.slug);
      expect(afterRestore.cards.map((c) => c.id).sort()).toEqual([open.id, done1.id].sort());
      expect(afterRestore.board.card_count).toBe(2);

      await deleteCard(done1.id);
      await deleteCard(done2.id);
      await deleteCard(open.id);
      await deleteColumn(col.id);
    } finally {
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

  it('Triage-Create: Quelle + Beschreibung + Checkliste + created_from_triage', async () => {
    const [u] = await db.select().from(users).limit(1);
    const [ev] = await db.select().from(events).limit(1);
    const [pub] = await db.select().from(publications).limit(1);
    const board = await createBoard('Triage Smoke Board');
    try {
      const col = await createColumn(board.id, 'Ideen');

      // Ohne Quelle: Beschreibung + initiale Checkliste, Activity bleibt 'created'.
      const plain = await createCard(u.id, {
        column_id: col.id,
        title: 'zztriagesmoke-plain Meroë',
        description_md: '**Wann:** morgen',
        items: [
          { kind: 'checklist', text: 'Web-ITV' },
          { kind: 'checklist', text: 'Video' },
          { kind: 'checklist', text: 'Fotos' },
          { kind: 'checklist', text: 'PM' },
        ],
      });
      const plainDetail = await getCardDetail(plain.id);
      expect(plainDetail.checklist_total).toBe(4);
      expect(plainDetail.items.map((i) => i.text)).toEqual(
        expect.arrayContaining(['Web-ITV', 'Video', 'Fotos', 'PM']),
      );
      // Item-Ranks sind eindeutig + aufsteigend (sequenzielle Vergabe).
      const ranks = plainDetail.items.map((i) => i.rank);
      expect(new Set(ranks).size).toBe(ranks.length);
      expect(plainDetail.description_html).toContain('<strong>Wann:</strong>');
      expect(plainDetail.activity.map((a) => a.verb)).toContain('created');
      expect(plainDetail.activity.map((a) => a.verb)).not.toContain('created_from_triage');

      // searchCards findet die Karte board-übergreifend (Titel-Match).
      const hits = await searchCards('zztriagesmoke-plain');
      expect(hits.map((h) => h.id)).toContain(plain.id);
      expect(hits.find((h) => h.id === plain.id)?.board_slug).toBe(board.slug);
      // Item-Text-Match (Checkliste) findet dieselbe Karte.
      const byItem = await searchCards('Web-ITV');
      expect(byItem.map((h) => h.id)).toContain(plain.id);

      // Dashboard: überfällige (offene) Karte landet in overdue, jede in recent.
      const overdueCard = await createCard(u.id, {
        column_id: col.id,
        title: 'zztriagesmoke-overdue',
        due_at: '2020-01-01',
      });
      const dash = await getBoardDashboardCards();
      expect(dash.overdue.map((c) => c.id)).toContain(overdueCard.id);
      expect(dash.recent.map((c) => c.id)).toContain(plain.id);

      // Mit Event-Quelle (falls lokal ein Event existiert): source_event_id +
      // created_from_triage + getCardsForSource-Rücklookup.
      if (ev) {
        const fromEvent = await createCard(u.id, {
          column_id: col.id,
          title: 'zztriagesmoke-event',
          source_event_id: ev.id,
        });
        const evDetail = await getCardDetail(fromEvent.id);
        expect(evDetail.source_event_id).toBe(ev.id);
        expect(evDetail.activity.map((a) => a.verb)).toContain('created_from_triage');
        const forEvent = await getCardsForSource({ eventId: ev.id });
        expect(forEvent.map((c) => c.id)).toContain(fromEvent.id);
      }
      if (pub) {
        const fromPub = await createCard(u.id, {
          column_id: col.id,
          title: 'zztriagesmoke-pub',
          source_publication_id: pub.id,
        });
        const forPub = await getCardsForSource({ publicationId: pub.id });
        expect(forPub.map((c) => c.id)).toContain(fromPub.id);
      }
    } finally {
      await db.delete(cards).where(eq(cards.boardId, board.id));
      await db.delete(boards).where(eq(boards.id, board.id));
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
