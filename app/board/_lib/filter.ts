import type { CardChip } from '@/lib/shared/board';
import { dueState } from './due';

/** Filterzustand der Board-Leiste (Design §3.4). Alles client-seitig aus dem
 *  geladenen Karten-Set — kein Server-Roundtrip beim Filtern. */
export interface BoardFilters {
  search: string;
  /** column_id oder null (Alle Kanäle). */
  columnId: string | null;
  /** userId, 'unassigned' oder null (Alle Personen). */
  personId: string | 'unassigned' | null;
  onlyOverdue: boolean;
  showCompleted: boolean;
}

export const EMPTY_FILTERS: BoardFilters = {
  search: '',
  columnId: null,
  personId: null,
  onlyOverdue: false,
  showCompleted: true,
};

export function hasActiveFilters(f: BoardFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.columnId !== null ||
    f.personId !== null ||
    f.onlyOverdue ||
    !f.showCompleted
  );
}

/**
 * matchCard (Design §3.4). Person-Treffer bewusst unscharf: Assignee ODER
 * Beobachter ODER Vorname im Freitext (Ownership-im-Text, MT-Kultur) — dafür
 * liefert der Aufrufer den kleingeschriebenen Vornamen der gesuchten Person.
 */
export function matchCard(
  card: CardChip,
  f: BoardFilters,
  firstNameOf: (userId: string) => string | null,
): boolean {
  if (f.columnId && card.column_id !== f.columnId) return false;
  if (!f.showCompleted && card.completed_at) return false;
  if (f.onlyOverdue && dueState(card.due_at, card.completed_at) !== 'overdue') return false;

  const q = f.search.trim().toLowerCase();
  if (q && !card.search_text.includes(q)) return false;

  if (f.personId === 'unassigned') {
    if (card.assignee_id) return false;
  } else if (f.personId) {
    const isAssignee = card.assignee_id === f.personId;
    const isWatcher = card.watcher_ids.includes(f.personId);
    const first = firstNameOf(f.personId);
    const inText = first ? card.search_text.includes(first.toLowerCase()) : false;
    if (!isAssignee && !isWatcher && !inText) return false;
  }
  return true;
}

/** Personen-Zähler für die Leiste: wie viele (gefilterte) Karten matchen jede
 *  Person bzw. „Nicht zugewiesen". Nutzt dieselbe Person-Logik wie matchCard. */
export function personCounts(
  cards: CardChip[],
  firstNameOf: (userId: string) => string | null,
): { unassigned: number; byUser: Record<string, number> } {
  const byUser: Record<string, number> = {};
  let unassigned = 0;
  for (const card of cards) {
    if (!card.assignee_id) unassigned++;
  }
  // Pro Person zählen (Assignee ∨ Beobachter ∨ Vorname im Text).
  const seenUsers = new Set<string>();
  for (const card of cards) {
    if (card.assignee_id) seenUsers.add(card.assignee_id);
    for (const w of card.watcher_ids) seenUsers.add(w);
  }
  for (const uid of seenUsers) {
    const first = firstNameOf(uid)?.toLowerCase() ?? null;
    byUser[uid] = cards.filter(
      (c) =>
        c.assignee_id === uid ||
        c.watcher_ids.includes(uid) ||
        (first ? c.search_text.includes(first) : false),
    ).length;
  }
  return { unassigned, byUser };
}
