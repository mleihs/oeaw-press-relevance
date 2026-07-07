import 'server-only';

import type {
  BoardColumn,
  BoardMember,
  BoardSummary,
  CardActivityEntry,
  CardChip,
  CardItem,
} from '@/lib/shared/board';
import type { UserRole } from '@/lib/shared/types';
import type { boardColumns, users } from '@/lib/server/db';

/** timestamptz aus einem Roh-SQL-Read (postgres-js liefert Date) -> ISO oder null. */
export function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  // mode:'string'-Spalten kommen bereits als String; unverändert lassen.
  return typeof v === 'string' ? new Date(v).toISOString() : null;
}

/** Zeile aus dem aggregierten Board-Listen-Query -> BoardSummary. */
export function boardSummaryFromRow(r: Record<string, unknown>): BoardSummary {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    rank: r.rank as string,
    archived_at: toIso(r.archived_at),
    card_count: Number(r.card_count ?? 0),
    last_activity_at: toIso(r.last_activity_at),
    is_favorite: Boolean(r.is_favorite),
  };
}

export function columnRowToApi(row: typeof boardColumns.$inferSelect): BoardColumn {
  return {
    id: row.id,
    board_id: row.boardId,
    name: row.name,
    color: row.color,
    icon: row.icon,
    rank: row.rank,
  };
}

/** Zeile aus dem aggregierten Karten-Chip-Query -> CardChip. */
export function cardChipFromRow(r: Record<string, unknown>): CardChip {
  return {
    id: r.id as string,
    board_id: r.board_id as string,
    column_id: r.column_id as string,
    title: r.title as string,
    link_url: (r.link_url as string | null) ?? null,
    rank: r.rank as string,
    due_at: toIso(r.due_at),
    completed_at: toIso(r.completed_at),
    assignee_id: (r.assignee_id as string | null) ?? null,
    watcher_ids: ((r.watcher_ids as string[] | null) ?? []).filter(Boolean),
    checklist_done: Number(r.checklist_done ?? 0),
    checklist_total: Number(r.checklist_total ?? 0),
    subtask_done: Number(r.subtask_done ?? 0),
    subtask_total: Number(r.subtask_total ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    attachment_count: Number(r.attachment_count ?? 0),
    label_ids: ((r.label_ids as string[] | null) ?? []).filter(Boolean),
    search_text: (r.search_text as string | null) ?? '',
  };
}

/** Zeile aus dem Item-Query (mit converted_card_id-LEFT-JOIN) -> CardItem. */
export function cardItemFromRow(r: Record<string, unknown>): CardItem {
  return {
    id: r.id as string,
    card_id: r.card_id as string,
    kind: r.kind as CardItem['kind'],
    text: r.text as string,
    rank: r.rank as string,
    done_at: toIso(r.done_at),
    done_by: (r.done_by as string | null) ?? null,
    converted_card_id: (r.converted_card_id as string | null) ?? null,
  };
}

export function activityRowToApi(r: Record<string, unknown>): CardActivityEntry {
  return {
    id: Number(r.id),
    card_id: r.card_id as string,
    actor_id: r.actor_id as string,
    verb: r.verb as string,
    payload: (r.payload as Record<string, unknown> | null) ?? {},
    created_at: toIso(r.created_at) ?? new Date(0).toISOString(),
  };
}

/** Stabile Kurz-Version des Storage-Keys → als `?v=` an die Avatar-URL gehängt.
 *  Der Key bekommt bei jedem Upload eine neue UUID, die URL ändert sich also
 *  mit dem Bild → Browser-Cache bricht von selbst, obwohl die Proxy-Route lange
 *  cachen darf (kein „altes Bild bleibt tagelang"-Problem). */
function avatarVersion(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function memberRowToApi(row: typeof users.$inferSelect): BoardMember {
  return {
    id: row.id,
    display_name: row.displayName,
    email: row.email,
    role: row.role as UserRole,
    disabled_at: row.disabledAt,
    avatar_url: row.avatarKey
      ? `/api/users/${row.id}/avatar?v=${avatarVersion(row.avatarKey)}`
      : null,
  };
}
