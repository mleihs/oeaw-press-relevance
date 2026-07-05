// Zod-Request-Schemas fürs Board (client-safe, zod-only — kein pg-core Import,
// hält die shared->shared Boundary). Validieren *Shape*; semantische Regeln
// (Rank-Neuberechnung, Activity, Löschguards) leben in lib/server/board/*.

import { z } from 'zod';
import { CARD_ITEM_KINDS } from './board';

const uuid = z.uuid('Ungültige ID.');

/** Fälligkeit: ISO-String (Datum oder Datetime) oder null (löschen). Absenz im
 *  PATCH = unverändert. Der Server normalisiert zu timestamptz. */
const dueAtField = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Ungültiges Datum.')
  .nullable();

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe muss #rrggbb sein.');

const linkUrlField = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v),
    'Link muss mit http(s):// beginnen.',
  )
  .nullable();

// --- Boards ---------------------------------------------------------------

export const boardCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich.').max(120),
});
export type BoardCreatePayload = z.infer<typeof boardCreateSchema>;

export const boardPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.archived !== undefined, {
    message: 'Leerer Patch: name oder archived angeben.',
  });
export type BoardPatchPayload = z.infer<typeof boardPatchSchema>;

export const favoritePayloadSchema = z.object({
  favorite: z.boolean(),
});
export type FavoritePayload = z.infer<typeof favoritePayloadSchema>;

// --- Columns --------------------------------------------------------------

export const columnCreateSchema = z.object({
  board_id: uuid,
  name: z.string().trim().min(1, 'Name erforderlich.').max(80),
  color: hexColor.optional(),
});
export type ColumnCreatePayload = z.infer<typeof columnCreateSchema>;

export const columnPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: hexColor.optional(),
    // Reorder: zwischen diese beiden Nachbarn setzen (Client liefert die IDs
    // aus dem Drop). null/absent = jeweils offenes Ende.
    before_id: uuid.nullish(),
    after_id: uuid.nullish(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.color !== undefined ||
      v.before_id !== undefined ||
      v.after_id !== undefined,
    { message: 'Leerer Patch.' },
  );
export type ColumnPatchPayload = z.infer<typeof columnPatchSchema>;

/** Einmaliges Neu-Anordnen aller Karten einer Spalte (kein Sortiermodus):
 *  nach Fälligkeit, alphabetisch oder nach Erstelldatum. */
export const COLUMN_SORT_KEYS = ['due', 'title', 'created'] as const;
export type ColumnSortKey = (typeof COLUMN_SORT_KEYS)[number];
export const columnSortSchema = z.object({
  by: z.enum(COLUMN_SORT_KEYS),
});
export type ColumnSortPayload = z.infer<typeof columnSortSchema>;

// --- Cards ----------------------------------------------------------------

// Ein initiales Checklisten-/Unteraufgaben-Item beim Karten-Anlegen (Triage:
// Format-Checkliste). Shape wie itemCreateSchema minus card_id (die Karte
// existiert beim Anlegen noch nicht).
const initialItemSchema = z.object({
  kind: z.enum(CARD_ITEM_KINDS),
  text: z.string().trim().min(1).max(500),
});
export type InitialItemPayload = z.infer<typeof initialItemSchema>;

// Quick-Create (Titel + Zielspalte; Board serverseitig aus der Spalte
// abgeleitet) UND Triage-Create (Phase 4): optional vorbefüllte Beschreibung,
// Quelle (Event/Publikation) und initiale Checkliste in EINEM Vorgang. Alle
// Triage-Felder optional -> der schlanke Quick-Create-Pfad bleibt unverändert.
export const cardCreateSchema = z
  .object({
    column_id: uuid,
    title: z.string().trim().min(1, 'Titel erforderlich.').max(200),
    link_url: linkUrlField.optional(),
    due_at: dueAtField.optional(),
    description_md: z.string().max(20000).nullable().optional(),
    source_event_id: uuid.nullable().optional(),
    source_publication_id: uuid.nullable().optional(),
    items: z.array(initialItemSchema).max(20).optional(),
  })
  // Eine Karte stammt aus höchstens einer Quelle (SourceChip + getCardsForSource
  // gehen von genau einer aus); beide gleichzeitig wäre eine widersprüchliche
  // Zuordnung.
  .refine((v) => !(v.source_event_id != null && v.source_publication_id != null), {
    message: 'Nur eine Quelle (Event oder Publikation) erlaubt.',
  });
export type CardCreatePayload = z.infer<typeof cardCreateSchema>;

export const cardPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description_md: z.string().max(20000).nullable().optional(),
    link_url: linkUrlField.optional(),
    due_at: dueAtField.optional(),
    assignee_id: uuid.nullable().optional(),
    completed: z.boolean().optional(),
    // Archiv (Feature 4): true = archivieren (aus dem Board raus, erhalten),
    // false = wiederherstellen. Unabhängig von `completed`.
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Leerer Patch.' });
export type CardPatchPayload = z.infer<typeof cardPatchSchema>;

// Move = Kanal-/Board-Wechsel: die Zielspalte impliziert das Zielboard.
export const cardMoveSchema = z.object({
  column_id: uuid,
});
export type CardMovePayload = z.infer<typeof cardMoveSchema>;

// --- Card items (Checkliste / Unteraufgaben) ------------------------------

export const itemCreateSchema = z.object({
  card_id: uuid,
  kind: z.enum(CARD_ITEM_KINDS),
  text: z.string().trim().min(1, 'Text erforderlich.').max(500),
});
export type ItemCreatePayload = z.infer<typeof itemCreateSchema>;

export const itemPatchSchema = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => v.text !== undefined || v.done !== undefined, {
    message: 'Leerer Patch.',
  });
export type ItemPatchPayload = z.infer<typeof itemPatchSchema>;

// Unteraufgabe -> eigene Karte (Zeitreise-Workflow). Zielspalte + optionale
// Fälligkeit; Titel = Item-Text (serverseitig übernommen).
export const itemConvertSchema = z.object({
  column_id: uuid,
  due_at: dueAtField.optional(),
});
export type ItemConvertPayload = z.infer<typeof itemConvertSchema>;

// --- Comments -------------------------------------------------------------

export const commentCreateSchema = z.object({
  body_md: z.string().trim().min(1, 'Kommentar darf nicht leer sein.').max(10000),
});
export type CommentCreatePayload = z.infer<typeof commentCreateSchema>;

// Bearbeiten hat exakt dieselbe Shape wie Anlegen (nur body_md) — Alias statt
// byte-identischer Dublette, damit beide Pfade nicht auseinanderdriften.
export const commentPatchSchema = commentCreateSchema;
export type CommentPatchPayload = z.infer<typeof commentPatchSchema>;

// --- Watchers -------------------------------------------------------------

export const watcherCreateSchema = z.object({
  user_id: uuid,
});
export type WatcherCreatePayload = z.infer<typeof watcherCreateSchema>;

export const labelCreateSchema = z.object({
  board_id: uuid,
  name: z.string().trim().min(1, 'Name erforderlich.').max(60),
  color: hexColor.optional(),
});
export type LabelCreatePayload = z.infer<typeof labelCreateSchema>;

export const cardLabelSchema = z.object({
  label_id: uuid,
});
export type CardLabelPayload = z.infer<typeof cardLabelSchema>;

// --- Smart-Objekt-Referenzen (BOARD_SMART_OBJECTS.md) ----------------------

// Referenz anlegen: intern per ID (Picker liefert sie), YouTube per URL/ID
// (Paste ODER Eigenkanal-Picker — der schickt die watch-URL).
export const referenceCreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), id: uuid }),
  z.object({ kind: z.literal('publication'), id: uuid }),
  z.object({ kind: z.literal('youtube'), url: z.string().trim().min(1, 'URL erforderlich.').max(2048) }),
]);
export type ReferenceCreatePayload = z.infer<typeof referenceCreateSchema>;
