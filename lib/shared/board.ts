// Wire DTOs + Konstanten für das Redaktionsboard (BOARD_PLAN.md §4). snake_case
// Wire-Shape (ADR 0004), aus Drizzle-Rows gemappt in lib/server/board/to-api.ts.
// Client-safe (kein server-only Import) — Board-UI, Filter, optimistische
// Updates teilen sich diese Typen mit dem Server.

import type { UserRole } from './types';

/** Freie Spaltenfarben (Board-Verwaltung, Design Book). Neue Spalten rotieren
 *  durch diese Palette; der Farbwähler zeigt sie als Swatches. */
export const BOARD_COLUMN_SWATCHES = [
  '#2563eb', '#0d9488', '#7c3aed', '#c026d3', '#ea580c',
  '#16a34a', '#e11d48', '#64748b', '#0891b2', '#d97706',
] as const;

/** Obergrenze pro Anhang (Bytes). Geteilt zwischen Server-Validierung
 *  (lib/server/board/attachments.ts) und UI-Hinweis. Bewusst konservativ wegen
 *  Vercels ~4,5-MB-Request-Body-Limit bei server-proxiertem Upload. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Checkliste UND Unteraufgaben in einer Tabelle, unterschieden über kind. */
export const CARD_ITEM_KINDS = ['checklist', 'subtask'] as const;
export type CardItemKind = (typeof CARD_ITEM_KINDS)[number];

/** Vokabular des append-only Aktivitätslogs. Der Server schreibt diese Verben
 *  bei create/move/complete/convert/due/assignee/item selbst; von/nach steht
 *  im payload. Attachments/Kommentare kommen in Phase 3 dazu. */
export const ACTIVITY_VERBS = [
  'created',
  'created_from_subtask',
  'created_from_triage',
  'moved',
  'completed',
  'reopened',
  'due_set',
  'due_cleared',
  'assignee_set',
  'assignee_cleared',
  'item_checked',
  'item_unchecked',
  'attachment_added',
  'comment_added',
  'archived',
  'unarchived',
  'reference_added',
  'reference_removed',
] as const;
export type ActivityVerb = (typeof ACTIVITY_VERBS)[number];

/** Team-Mitglied für Personen-Leiste, Assignee-/Beobachter-Picker und die
 *  Attribution von Aktivität/Kommentaren (GET /api/board/members). */
export interface BoardMember {
  id: string;
  display_name: string | null;
  email: string;
  role: UserRole;
  disabled_at: string | null;
  /** Proxy-URL des Profilbilds (/api/users/[id]/avatar) oder null → Initialen. */
  avatar_url: string | null;
}

/** Kachel in der Board-Übersicht + Zeile im Switcher. */
export interface BoardSummary {
  id: string;
  name: string;
  slug: string;
  rank: string;
  archived_at: string | null;
  card_count: number;
  /** Aus card_activity abgeleitet („zuletzt aktiv"); kein Denormalisieren (v1). */
  last_activity_at: string | null;
  is_favorite: boolean;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  name: string;
  /** Hex-Akzent (#rrggbb). Client mappt Spaltenname -> Kanal-Icon. */
  color: string;
  rank: string;
}

/** Label/Tag je Board (MeisterTask-Pendant). Karten referenzieren Labels über
 *  `CardChip.label_ids`; die Palette kommt board-weit in `BoardWithColumns`. */
export interface BoardLabel {
  id: string;
  board_id: string;
  name: string;
  /** Hex (#rrggbb) — Chip-Farbe. */
  color: string;
  rank: string;
}

/** Freie Label-Farben für neue Labels (rotieren durch die Palette). */
export const BOARD_LABEL_SWATCHES = [
  '#2563eb', '#0d9488', '#7c3aed', '#c026d3', '#ea580c',
  '#16a34a', '#e11d48', '#0891b2', '#d97706', '#64748b',
] as const;

/** Karten-Chip im Board (Aggregat-Zähler statt voller Items — die kommen erst
 *  im Modal). `search_text` = kleingeschriebener Titel + alle Item-Texte, damit
 *  Filter (Suche + „Vorname im Checklisten-Text"-Personenmatch) rein im Client
 *  laufen. */
export interface CardChip {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  link_url: string | null;
  rank: string;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  watcher_ids: string[];
  checklist_done: number;
  checklist_total: number;
  subtask_done: number;
  subtask_total: number;
  comment_count: number;
  attachment_count: number;
  /** IDs der an der Karte hängenden Labels (auflösbar über die Board-Palette
   *  in `BoardWithColumns.labels`). Reihenfolge = Label-Rank. */
  label_ids: string[];
  search_text: string;
}

export interface CardItem {
  id: string;
  card_id: string;
  kind: CardItemKind;
  text: string;
  rank: string;
  done_at: string | null;
  done_by: string | null;
  /** Für Unteraufgaben: die Karte, die daraus umgewandelt wurde (Rück-Lookup
   *  über cards.converted_from_item_id). null = noch nicht umgewandelt. */
  converted_card_id: string | null;
}

export interface CardComment {
  id: string;
  card_id: string;
  author_id: string;
  body_md: string;
  /** Server-gerendertes, gesäubertes HTML aus body_md (gleiche Pipeline wie
   *  description_html). Client rendert nur diese Ausgabe. */
  body_html: string;
  created_at: string;
  edited_at: string | null;
}

export interface CardAttachment {
  id: string;
  card_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface CardActivityEntry {
  id: number;
  card_id: string;
  actor_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// --- Smart-Objekte (BOARD_SMART_OBJECTS.md) --------------------------------

/** Metadaten-Snapshot eines YouTube-Videos (external_objects.snapshot).
 *  Via API v3 vollständig; via oEmbed-Fallback (kein YOUTUBE_API_KEY) fehlen
 *  published_at/duration_seconds/view_count (null). */
export interface YoutubeSnapshot {
  title: string;
  channel_title: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  /** Quell-URL des Thumbnails (i.ytimg.com). Anzeige läuft über den
   *  same-origin Proxy /api/board/objects/[id]/thumbnail (MinIO-Mirror mit
   *  Hotlink-Fallback); diese URL ist der Fallback + Mirror-Input. */
  thumbnail_url: string | null;
}

/** Referenz-Arten. Intern (event/publication) = Live-Join, extern (youtube) =
 *  Registry-Snapshot. */
export type CardReferenceKind = 'event' | 'publication' | 'youtube';

/** Eine Referenz-Zeile der Karte (card_references), diskriminiert über kind.
 *  `id` = Zeilen-UUID (refKey für DELETE). Interne Ziele tragen live gejointe
 *  Metadaten, YouTube den Registry-Snapshot. */
export type CardReference =
  | {
      id: string;
      kind: 'event';
      created_at: string;
      target_id: string;
      title: string;
      event_at: string | null;
      score: number | null;
      decision: string | null;
    }
  | {
      id: string;
      kind: 'publication';
      created_at: string;
      target_id: string;
      title: string;
      published_at: string | null;
      press_score: number | null;
    }
  | {
      id: string;
      kind: 'youtube';
      created_at: string;
      /** external_objects.id — Basis für Thumbnail-Proxy + Refresh. */
      target_id: string;
      url: string | null;
      refreshed_at: string | null;
      snapshot: YoutubeSnapshot;
    };

/** Vorschlag im „Objekt hinzufügen"-Picker (Tabs Veranstaltung/Publikation).
 *  date/score sind je nach kind event_at/event_score bzw.
 *  published_at/press_score; decision nur bei Events. */
export interface ReferenceTargetSuggestion {
  id: string;
  title: string;
  date: string | null;
  score: number | null;
  decision: string | null;
}

/** Eigenkanal-Video im YouTube-Tab des Pickers (Wire-Shape der Route
 *  /api/board/connectors/youtube/videos). */
export interface YoutubePickerVideo {
  video_id: string;
  title: string;
  published_at: string | null;
  thumbnail_url: string | null;
}

/** Sekunden -> "m:ss" bzw. "h:mm:ss" (YouTube-Dauer-Badge). */
export function formatVideoDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Volle Karte fürs Modal. */
export interface CardDetail extends CardChip {
  /** Archiviert-Zeitpunkt (Feature 4) oder null = aktiv. Der Board-Chip trägt
   *  ihn nicht (archivierte Karten sind aus dem Board raus); im Detail steht er,
   *  damit ein per Deep-Link/Archiv geöffnetes Modal „Wiederherstellen" zeigt. */
  archived_at: string | null;
  description_md: string | null;
  /** Server-gerendertes, gesäubertes HTML aus description_md (Markdown →
   *  marked → sanitize-html). Client rendert nur diese Ausgabe. */
  description_html: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  converted_from_item_id: string | null;
  source_event_id: string | null;
  source_publication_id: string | null;
  items: CardItem[];
  comments: CardComment[];
  attachments: CardAttachment[];
  activity: CardActivityEntry[];
  /** Smart-Objekt-Referenzen (Events/Publikationen/YouTube), nach created_at. */
  references: CardReference[];
}

/** Voller Board-Load für /board/[slug]. */
export interface BoardWithColumns {
  board: BoardSummary;
  columns: BoardColumn[];
  cards: CardChip[];
  /** Label-Palette des Boards (für Chips an Karten + Filter + Picker). */
  labels: BoardLabel[];
  /** IDs der Kanäle, die der aktuelle Nutzer für sich ausgeblendet hat
   *  (per-User, user_hidden_columns). Der Client rendert sie nicht, zeigt
   *  aber eine „N ausgeblendet"-Leiste zum Wiedereinblenden. */
  hidden_column_ids: string[];
}

/** Schlanke, board-übergreifende Karten-Referenz (Phase 4): Dashboard-Kachel,
 *  ⌘K-Kartensuche, „liegt im Board"-Anzeige an Event/Publikation. Trägt den
 *  Board-Slug für den Deep-Link `/board/{board_slug}?card={id}`. */
export interface BoardCardRef {
  id: string;
  title: string;
  board_slug: string;
  board_name: string;
  column_name: string | null;
  /** Kanalfarbe (board_columns.color) — Farb-Punkt der Dashboard-Kachel. */
  column_color: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Archivierte Karte in der Archiv-Ansicht eines Boards (Feature 4). Trägt den
 *  Herkunfts-Kanal (Name + Farbe) und den Archivierungszeitpunkt. */
export interface ArchivedCard {
  id: string;
  title: string;
  column_id: string;
  column_name: string;
  column_color: string;
  due_at: string | null;
  completed_at: string | null;
  archived_at: string;
}

/** Deep-Link zu einer Karte (öffnet das Modal via ?card=-Query). */
export function cardDeepLink(ref: Pick<BoardCardRef, 'board_slug' | 'id'>): string {
  return `/board/${encodeURIComponent(ref.board_slug)}?card=${encodeURIComponent(ref.id)}`;
}

/** Maximale Kartentitel-Länge (cardCreateSchema/cardPatchSchema `.max(200)`). */
export const CARD_TITLE_MAX = 200;

/** Kürzt einen vorbefüllten Kartentitel auf die erlaubte Länge, damit ein langer
 *  Publikations-/Event-Titel den Create nicht mit einem 400 abweist. */
export function clampCardTitle(title: string): string {
  const t = title.trim();
  return t.length <= CARD_TITLE_MAX ? t : `${t.slice(0, CARD_TITLE_MAX - 1).trimEnd()}…`;
}

/** „Board · Kanal"-Untertitel für board-übergreifende Karten-Referenzen
 *  (Dashboard-Kachel + ⌘K-Treffer). */
export function cardLocationLabel(ref: Pick<BoardCardRef, 'board_name' | 'column_name'>): string {
  return ref.column_name ? `${ref.board_name} · ${ref.column_name}` : ref.board_name;
}

/** Gruppierte Karten für die Dashboard-Kachel. */
export interface BoardDashboardCards {
  overdue: BoardCardRef[];
  due_soon: BoardCardRef[];
  recent: BoardCardRef[];
}

/**
 * Slug aus einem Board-Namen (ASCII-kebab). Umlaute werden transliteriert,
 * alles andere Nicht-Alphanumerische zu einem Bindestrich. Ergebnis matcht
 * boards_slug_format_check ('^[a-z0-9]+(-[a-z0-9]+)*$'); ein leeres Ergebnis
 * (nur Sonderzeichen) fällt auf 'board' zurück (der Aufrufer macht ihn
 * unique).
 */
export function slugifyBoardName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'board';
}
