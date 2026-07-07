import type {
  ArchivedCard,
  BoardCardRef,
  BoardColumn,
  BoardMember,
  BoardSummary,
  BoardWithColumns,
  CardAttachment,
  CardChip,
  CardComment,
  CardDetail,
  CardItem,
  CardItemKind,
  CardReference,
  BoardLabel,
  ReferenceTargetSuggestion,
  YoutubePickerVideo,
} from '@/lib/shared/board';
import type { InitialItemPayload, ReferenceCreatePayload } from '@/lib/shared/board-schemas';

// Client-Fetch-Helfer fürs Board. Same-origin (Origin-Header) -> passiert die
// CSRF-Prüfung in withApiError. Wirft mit der Server-Fehlermeldung.

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* nicht-JSON Fehlerseite */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => jsonOrThrow<T>(r));
}

// --- Reads ---
export const fetchBoards = () =>
  send<{ boards: BoardSummary[] }>('/api/board/boards', 'GET').then((r) => r.boards);
export const fetchBoardView = (slug: string) =>
  send<BoardWithColumns>(`/api/board/view/${encodeURIComponent(slug)}`, 'GET');
export const fetchMembers = () =>
  send<{ members: BoardMember[] }>('/api/board/members', 'GET').then((r) => r.members);
export const fetchCard = (id: string) =>
  send<{ card: CardDetail }>(`/api/board/cards/${id}`, 'GET').then((r) => r.card);

// --- Boards ---
export const createBoardApi = (name: string) =>
  send<{ board: BoardSummary }>('/api/board/boards', 'POST', { name }).then((r) => r.board);
export const patchBoardApi = (id: string, patch: { name?: string; archived?: boolean }) =>
  send<{ board: BoardSummary }>(`/api/board/boards/${id}`, 'PATCH', patch).then((r) => r.board);
export const setFavoriteApi = (id: string, favorite: boolean) =>
  send<{ ok: true }>(`/api/board/boards/${id}/favorite`, 'POST', { favorite });

// --- Columns ---
export const createColumnApi = (boardId: string, name: string, color?: string) =>
  send<{ column: BoardColumn }>('/api/board/columns', 'POST', {
    board_id: boardId,
    name,
    color,
  }).then((r) => r.column);
export const patchColumnApi = (
  id: string,
  patch: {
    name?: string;
    color?: string;
    icon?: string | null;
    before_id?: string | null;
    after_id?: string | null;
  },
) => send<{ column: BoardColumn }>(`/api/board/columns/${id}`, 'PATCH', patch).then((r) => r.column);
export const deleteColumnApi = (id: string) =>
  send<{ ok: true }>(`/api/board/columns/${id}`, 'DELETE');
export const sortColumnApi = (id: string, by: 'due' | 'title' | 'created') =>
  send<{ ok: true }>(`/api/board/columns/${id}/sort`, 'POST', { by });
/** Kanal für den aktuellen Nutzer ausblenden / wieder einblenden (per-User). */
export const hideColumnApi = (id: string) =>
  send<{ ok: true }>(`/api/board/columns/${id}/hidden`, 'POST');
export const unhideColumnApi = (id: string) =>
  send<{ ok: true }>(`/api/board/columns/${id}/hidden`, 'DELETE');

// --- Labels ---
export const createLabelApi = (boardId: string, name: string, color?: string) =>
  send<{ label: BoardLabel }>(`/api/board/boards/${boardId}/labels`, 'POST', {
    board_id: boardId,
    name,
    color,
  }).then((r) => r.label);
export const deleteLabelApi = (labelId: string) =>
  send<{ ok: true }>(`/api/board/labels/${labelId}`, 'DELETE');
export const addCardLabelApi = (cardId: string, labelId: string) =>
  send<{ ok: true }>(`/api/board/cards/${cardId}/labels`, 'POST', { label_id: labelId });
export const removeCardLabelApi = (cardId: string, labelId: string) =>
  send<{ ok: true }>(
    `/api/board/cards/${cardId}/labels?label_id=${encodeURIComponent(labelId)}`,
    'DELETE',
  );

// --- Cards ---
export const createCardApi = (payload: {
  column_id: string;
  title: string;
  link_url?: string | null;
  due_at?: string | null;
  description_md?: string | null;
  source_event_id?: string | null;
  source_publication_id?: string | null;
  items?: InitialItemPayload[];
}) => send<{ card: CardChip }>('/api/board/cards', 'POST', payload).then((r) => r.card);

/** Board-übergreifende Kartensuche (⌘K-Palette). */
export const searchCardsApi = (q: string) =>
  send<{ cards: BoardCardRef[] }>(
    `/api/board/cards/search?q=${encodeURIComponent(q)}`,
    'GET',
  ).then((r) => r.cards);

/** Karten, die aus einem Event bzw. einer Publikation angelegt wurden. */
export const fetchCardsForSourceApi = (source: {
  eventId?: string;
  publicationId?: string;
}) => {
  const p = new URLSearchParams();
  if (source.eventId) p.set('event_id', source.eventId);
  if (source.publicationId) p.set('publication_id', source.publicationId);
  return send<{ cards: BoardCardRef[] }>(
    `/api/board/cards/for-source?${p.toString()}`,
    'GET',
  ).then((r) => r.cards);
};
export const patchCardApi = (
  id: string,
  patch: {
    title?: string;
    description_md?: string | null;
    link_url?: string | null;
    due_at?: string | null;
    assignee_id?: string | null;
    completed?: boolean;
    archived?: boolean;
  },
) => send<{ card: CardDetail }>(`/api/board/cards/${id}`, 'PATCH', patch).then((r) => r.card);
/** Alle erledigten Karten einer Spalte archivieren. Liefert die Anzahl. */
export const archiveCompletedApi = (columnId: string) =>
  send<{ archived: number }>(`/api/board/columns/${columnId}/archive-completed`, 'POST').then(
    (r) => r.archived,
  );
/** Archivierte Karten eines Boards (Archiv-Ansicht). */
export const fetchArchivedCards = (boardId: string) =>
  send<{ cards: ArchivedCard[] }>(`/api/board/boards/${boardId}/archive`, 'GET').then(
    (r) => r.cards,
  );
export const moveCardApi = (
  id: string,
  columnId: string,
  neighbors?: { beforeId?: string | null; afterId?: string | null },
) =>
  send<{ card: CardDetail }>(`/api/board/cards/${id}/move`, 'POST', {
    column_id: columnId,
    before_id: neighbors?.beforeId ?? null,
    after_id: neighbors?.afterId ?? null,
  }).then((r) => r.card);
export const deleteCardApi = (id: string) =>
  send<{ ok: true }>(`/api/board/cards/${id}`, 'DELETE');

// --- Items ---
export const addItemApi = (cardId: string, kind: CardItemKind, text: string) =>
  send<{ item: CardItem }>('/api/board/items', 'POST', {
    card_id: cardId,
    kind,
    text,
  }).then((r) => r.item);
export const patchItemApi = (id: string, patch: { text?: string; done?: boolean }) =>
  send<{ item: CardItem }>(`/api/board/items/${id}`, 'PATCH', patch).then((r) => r.item);
export const deleteItemApi = (id: string) =>
  send<{ ok: true }>(`/api/board/items/${id}`, 'DELETE');
export const convertItemApi = (id: string, columnId: string, dueAt?: string | null) =>
  send<{ card: CardDetail }>(`/api/board/items/${id}/convert`, 'POST', {
    column_id: columnId,
    due_at: dueAt ?? undefined,
  }).then((r) => r.card);

// --- Comments ---
export const addCommentApi = (cardId: string, bodyMd: string) =>
  send<{ comment: CardComment }>(`/api/board/cards/${cardId}/comments`, 'POST', {
    body_md: bodyMd,
  }).then((r) => r.comment);
export const editCommentApi = (id: string, bodyMd: string) =>
  send<{ comment: CardComment }>(`/api/board/comments/${id}`, 'PATCH', {
    body_md: bodyMd,
  }).then((r) => r.comment);
export const deleteCommentApi = (id: string) =>
  send<{ ok: true }>(`/api/board/comments/${id}`, 'DELETE');

// --- Attachments ---
// Multipart: KEIN content-type-Header setzen — der Browser setzt die
// multipart-Boundary selbst (send() würde application/json erzwingen).
export const uploadAttachmentApi = (cardId: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`/api/board/cards/${cardId}/attachments`, {
    method: 'POST',
    body: fd,
  })
    .then((r) => jsonOrThrow<{ attachment: CardAttachment }>(r))
    .then((r) => r.attachment);
};
export const deleteAttachmentApi = (id: string) =>
  send<{ ok: true }>(`/api/board/attachments/${id}`, 'DELETE');
/** Same-origin Proxy-URL für Download/Inline-Ansicht eines Anhangs. */
export const attachmentUrl = (id: string) => `/api/board/attachments/${id}`;

// --- Smart-Objekt-Referenzen ---
// Alle Mutationen antworten mit der vollständigen Referenzliste der Karte
// (eine Quelle der Wahrheit für die Modal-Sektion, kein Client-Merge).
export const addReferenceApi = (cardId: string, payload: ReferenceCreatePayload) =>
  send<{ references: CardReference[] }>(
    `/api/board/cards/${cardId}/references`,
    'POST',
    payload,
  ).then((r) => r.references);
export const removeReferenceApi = (cardId: string, refId: string) =>
  send<{ references: CardReference[] }>(
    `/api/board/cards/${cardId}/references/${refId}`,
    'DELETE',
  ).then((r) => r.references);
export const refreshReferenceApi = (cardId: string, refId: string) =>
  send<{ references: CardReference[] }>(
    `/api/board/cards/${cardId}/references/${refId}/refresh`,
    'POST',
  ).then((r) => r.references);
/** Picker-Suche über Events/Publikationen (Titel-Substring, neueste zuerst). */
export const searchReferenceTargetsApi = (kind: 'event' | 'publication', q: string) =>
  send<{ suggestions: ReferenceTargetSuggestion[] }>(
    `/api/board/references/search?kind=${kind}&q=${encodeURIComponent(q)}`,
    'GET',
  ).then((r) => r.suggestions);
/** Eigenkanal-Videos für den YouTube-Tab (configured=false → nur URL-Paste). */
export const fetchYoutubeVideosApi = (q: string) =>
  send<{ configured: boolean; videos: YoutubePickerVideo[] }>(
    `/api/board/connectors/youtube/videos?q=${encodeURIComponent(q)}`,
    'GET',
  );
/** Same-origin Proxy-URL des Thumbnails eines externen Objekts. */
export const objectThumbnailUrl = (objectId: string) =>
  `/api/board/objects/${objectId}/thumbnail`;

// --- Watchers ---
export const addWatcherApi = (cardId: string, userId: string) =>
  send<{ ok: true }>(`/api/board/cards/${cardId}/watchers`, 'POST', { user_id: userId });
export const removeWatcherApi = (cardId: string, userId: string) =>
  send<{ ok: true }>(
    `/api/board/cards/${cardId}/watchers?user_id=${encodeURIComponent(userId)}`,
    'DELETE',
  );
