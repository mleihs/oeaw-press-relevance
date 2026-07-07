// ELIGIBILITY_EXCLUDE_TYPE_UIDS lives in lib/eligibility.ts so the server route
// (app/api/publications/route.ts) and any client-side filter UI share one source.
// Re-exported here for convenience if the publications page wants to read it.
export { ELIGIBILITY_EXCLUDE_TYPE_UIDS } from '@/lib/shared/eligibility';

export const PAGE_SIZE = 20;

// Manuell wählbare Sortierungen der Publikationsliste. Die `key`s MÜSSEN in
// SORTABLE_COLUMNS (lib/server/publications/list.ts) existieren — sonst fällt
// der Query-Layer stillschweigend auf 'published_at' zurück. Bewusst eine
// kuratierte Teilmenge: die 5 LLM-Dimensionen + Pipeline-Status bleiben der
// Dashboard-Radar-Interaktion vorbehalten und würden das Menü überfrachten.
// `defaultOrder` = die intuitive Richtung beim Auswählen (Score/Datum: höchste/
// neueste zuerst; Titel/Autor:in: A→Z).
export const SORT_OPTIONS = [
  { key: 'press_score', label: 'Bewertung (Score)', defaultOrder: 'desc' },
  { key: 'published_at', label: 'Erscheinungsdatum', defaultOrder: 'desc' },
  { key: 'updated_at', label: 'Zuletzt geändert', defaultOrder: 'desc' },
  { key: 'title', label: 'Titel', defaultOrder: 'asc' },
  { key: 'lead_author', label: 'Erstautor:in', defaultOrder: 'asc' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  defaultOrder: 'asc' | 'desc';
}>;

// publication_type webdb_uids forming the "Wissenschaftlich" preset.
export const WISS_TYPE_UIDS = [
  1,  // Beitrag in Fachzeitschrift  (Journal article)
  4,  // Beitrag in Sammelwerk        (Book chapter)
  6,  // Buch/Monographie             (Book)
  14, // Herausgeberschaft            (Editorship)
  16, // Konferenzbeitrag: Publikation in Proceedingsband (Conference paper)
];

export const SUPER_DOMAIN_LABELS: Record<number, string> = {
  1: 'Naturwissenschaften',
  2: 'Technische Wissenschaften',
  3: 'Humanmedizin, Gesundheitswiss.',
  4: 'Agrarwissenschaften, Vet.med.',
  5: 'Sozialwissenschaften',
  6: 'Geisteswissenschaften',
};

export const SUPER_DOMAINS = Object.keys(SUPER_DOMAIN_LABELS)
  .map(Number)
  .sort((a, b) => a - b);
