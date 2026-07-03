import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db, cards, cardWatchers } from '@/lib/server/db';
import { CardNotFoundError } from './errors';

async function assertCard(cardId: string): Promise<void> {
  const [c] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!c) throw new CardNotFoundError();
}

export async function addWatcher(cardId: string, userId: string): Promise<void> {
  await assertCard(cardId);
  await db
    .insert(cardWatchers)
    .values({ cardId, userId })
    .onConflictDoNothing();
}

export async function removeWatcher(cardId: string, userId: string): Promise<void> {
  await db
    .delete(cardWatchers)
    .where(and(eq(cardWatchers.cardId, cardId), eq(cardWatchers.userId, userId)));
}
