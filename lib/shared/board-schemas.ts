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

// --- Cards ----------------------------------------------------------------

// Schlankes Quick-Create (Plan §5: KEIN Triage-Modal in Phase 2). Titel +
// Zielspalte; Board wird serverseitig aus der Spalte abgeleitet.
export const cardCreateSchema = z.object({
  column_id: uuid,
  title: z.string().trim().min(1, 'Titel erforderlich.').max(200),
  link_url: linkUrlField.optional(),
  due_at: dueAtField.optional(),
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

// --- Watchers -------------------------------------------------------------

export const watcherCreateSchema = z.object({
  user_id: uuid,
});
export type WatcherCreatePayload = z.infer<typeof watcherCreateSchema>;
