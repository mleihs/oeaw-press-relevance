import 'server-only';

import { asc } from 'drizzle-orm';
import { db, users } from '@/lib/server/db';
import type { BoardMember } from '@/lib/shared/board';
import { memberRowToApi } from './to-api';

/**
 * Alle Nutzer fürs Board (Personen-Leiste, Assignee-/Beobachter-Picker,
 * Attribution von Aktivität/Kommentaren). Bewusst INKLUSIVE deaktivierter
 * Nutzer — Autorschaft (assignee/actor/watcher) muss auch nach dem
 * Deaktivieren noch mit Namen auflösbar sein. Der Client blendet deaktivierte
 * aus den Filter-Chips aus, nutzt sie aber zur Namensauflösung.
 */
export async function listBoardMembers(): Promise<BoardMember[]> {
  const rows = await db.select().from(users).orderBy(asc(users.displayName), asc(users.email));
  return rows.map(memberRowToApi);
}
