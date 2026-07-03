// Domänenfehler des Boards. Die Routen mappen sie auf HTTP-Status (404/409);
// alles andere fällt über withApiError auf 500.

export class BoardNotFoundError extends Error {
  constructor(message = 'Board nicht gefunden.') {
    super(message);
    this.name = 'BoardNotFoundError';
  }
}

export class ColumnNotFoundError extends Error {
  constructor(message = 'Spalte nicht gefunden.') {
    super(message);
    this.name = 'ColumnNotFoundError';
  }
}

export class CardNotFoundError extends Error {
  constructor(message = 'Karte nicht gefunden.') {
    super(message);
    this.name = 'CardNotFoundError';
  }
}

export class CardItemNotFoundError extends Error {
  constructor(message = 'Eintrag nicht gefunden.') {
    super(message);
    this.name = 'CardItemNotFoundError';
  }
}

export class CommentNotFoundError extends Error {
  constructor(message = 'Kommentar nicht gefunden.') {
    super(message);
    this.name = 'CommentNotFoundError';
  }
}

export class AttachmentNotFoundError extends Error {
  constructor(message = 'Anhang nicht gefunden.') {
    super(message);
    this.name = 'AttachmentNotFoundError';
  }
}

/** Aktion an fremdem Inhalt ohne Berechtigung (403). Kommentare/Anhänge darf
 *  nur der Urheber ändern/löschen (Admin zusätzlich löschen). */
export class BoardForbiddenError extends Error {
  constructor(message = 'Keine Berechtigung für diese Aktion.') {
    super(message);
    this.name = 'BoardForbiddenError';
  }
}

/** Upload verletzt Größen-/Typ-Limit (413/415 — beide als 400-nahe 4xx). */
export class AttachmentRejectedError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AttachmentRejectedError';
    this.status = status;
  }
}

/** Spalte enthält noch Karten -> Löschen verboten (409). Das „Spalte enthält
 *  Karten"-Warnmodal im Design ist die UI dazu; die DB (RESTRICT) garantiert es
 *  zusätzlich hart. */
export class ColumnNotEmptyError extends Error {
  readonly cardCount: number;
  constructor(cardCount: number) {
    super(`Spalte enthält noch ${cardCount} Karte(n).`);
    this.name = 'ColumnNotEmptyError';
    this.cardCount = cardCount;
  }
}

/** Unteraufgabe wurde bereits in eine Karte umgewandelt (409). Verhindert den
 *  Doppel-Convert (zwei Karten mit demselben converted_from_item_id -> Join-
 *  Fan-out in getCardDetail). */
export class ItemAlreadyConvertedError extends Error {
  readonly cardId: string;
  constructor(cardId: string) {
    super('Diese Unteraufgabe wurde bereits in eine Karte umgewandelt.');
    this.name = 'ItemAlreadyConvertedError';
    this.cardId = cardId;
  }
}

/** Rank-Kollision beim Spalten-Reorder ließ sich nicht auflösen (409). */
export class BoardConflictError extends Error {
  constructor(message = 'Konflikt — bitte neu laden und erneut versuchen.') {
    super(message);
    this.name = 'BoardConflictError';
  }
}

/**
 * Postgres 23505 (unique_violation) — für den Rank-Kollisions-Retry und den
 * createBoard-Slug-Dedup-Loop. WICHTIG: drizzle-orm (0.45) wickelt Treiber-
 * fehler in einen `DrizzleQueryError`, dessen `.code` undefined ist — der
 * echte SQLSTATE liegt auf `.cause.code` (der postgres-js-Fehler). Deshalb die
 * cause-Kette abwandern; sonst greift KEIN Retry und KEIN Slug-Dedup (jede
 * Kollision würde als 500 durchschlagen).
 */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur != null; depth++) {
    if (
      typeof cur === 'object' &&
      'code' in cur &&
      (cur as { code?: string }).code === '23505'
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
