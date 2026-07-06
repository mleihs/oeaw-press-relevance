import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { db, cards, cardComments } from '@/lib/server/db';
import type { CardComment } from '@/lib/shared/board';
import type { CurrentUser } from '@/lib/shared/types';
import { CardNotFoundError, CommentNotFoundError, BoardForbiddenError } from './errors';
import { extractMentionNames, renderCardMarkdown } from './markdown';
import { writeActivity } from './activity';
import { listBoardMembers } from './members';
import { addWatcher } from './watchers';
import { toIso } from './to-api';

/** Drizzle-Row -> Wire-DTO. body_html wird serverseitig aus body_md gerendert
 *  (marked -> sanitize-html, gleiche Pipeline wie die Kartenbeschreibung). */
function toApi(row: typeof cardComments.$inferSelect): CardComment {
  return {
    id: row.id,
    card_id: row.cardId,
    author_id: row.authorId,
    body_md: row.bodyMd,
    body_html: renderCardMarkdown(row.bodyMd),
    created_at: toIso(row.createdAt) ?? new Date(0).toISOString(),
    edited_at: toIso(row.editedAt),
  };
}

/** @-Mentions -> Beobachter (MeisterTask-Verhalten): erwähnte, aktive Member
 *  werden still zur Karte hinzugefügt. Namens-Match statt Ids, weil das
 *  Mention-Token id-los ist (`@[Anzeigename]`, siehe markdown.ts); trifft ein
 *  Name nicht (Umbenennung, Tippfehler), bleibt es bei der Hervorhebung. */
async function addMentionedAsWatchers(
  cardId: string,
  bodyMd: string,
  authorId: string,
): Promise<void> {
  const names = extractMentionNames(bodyMd);
  if (names.length === 0) return;
  const members = await listBoardMembers();
  const byName = new Map(
    members
      .filter((m) => !m.disabled_at && m.display_name?.trim())
      .map((m) => [m.display_name!.trim().toLowerCase(), m.id]),
  );
  for (const name of names) {
    const userId = byName.get(name.toLowerCase());
    if (userId && userId !== authorId) await addWatcher(cardId, userId);
  }
}

/** Alle Kommentare einer Karte, chronologisch (ältester zuerst). */
export async function loadComments(cardId: string): Promise<CardComment[]> {
  const rows = await db
    .select()
    .from(cardComments)
    .where(eq(cardComments.cardId, cardId))
    .orderBy(asc(cardComments.createdAt), asc(cardComments.id));
  return rows.map(toApi);
}

export async function addComment(
  userId: string,
  cardId: string,
  bodyMd: string,
): Promise<CardComment> {
  const [c] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!c) throw new CardNotFoundError();

  const [row] = await db
    .insert(cardComments)
    .values({ cardId, authorId: userId, bodyMd })
    .returning();

  // Activity speist „zuletzt aktiv" pro Board (last_activity_at). Der Strang im
  // Modal blendet comment_added-Zeilen aus — dort steht der Kommentar selbst.
  await writeActivity(cardId, userId, 'comment_added', { comment_id: row.id });
  await addMentionedAsWatchers(cardId, bodyMd, userId);
  return toApi(row);
}

/** Nur der Urheber darf seinen Kommentar bearbeiten. */
export async function editComment(
  user: CurrentUser,
  commentId: string,
  bodyMd: string,
): Promise<CardComment> {
  const [row] = await db
    .select()
    .from(cardComments)
    .where(eq(cardComments.id, commentId))
    .limit(1);
  if (!row) throw new CommentNotFoundError();
  if (row.authorId !== user.id) throw new BoardForbiddenError();

  const [updated] = await db
    .update(cardComments)
    .set({ bodyMd, editedAt: new Date().toISOString() })
    .where(eq(cardComments.id, commentId))
    .returning();
  await addMentionedAsWatchers(row.cardId, bodyMd, user.id);
  return toApi(updated);
}

/** Urheber oder Admin darf löschen. */
export async function deleteComment(user: CurrentUser, commentId: string): Promise<void> {
  const [row] = await db
    .select({ authorId: cardComments.authorId })
    .from(cardComments)
    .where(eq(cardComments.id, commentId))
    .limit(1);
  if (!row) throw new CommentNotFoundError();
  if (row.authorId !== user.id && user.role !== 'admin') throw new BoardForbiddenError();

  await db.delete(cardComments).where(eq(cardComments.id, commentId));
}
