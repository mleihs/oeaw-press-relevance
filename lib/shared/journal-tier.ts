/**
 * Tier classification for academic journals — drives the visual highlight
 * of publications from flagship general-science outlets in lists (Dashboard
 * Top-Pubs, /publications table). Single source of truth so both renderers
 * agree on what counts as "top".
 *
 * Currently one tier: 'top' = Nature family (Springer Nature) + Science
 * family (AAAS). Keep this set narrow on purpose — broad whitelists drift
 * into editorial judgements about other prestigious venues (Cell, NEJM,
 * Lancet, PNAS, …) which the user hasn't asked for and which open a
 * field-bias debate we don't want to litigate inside a UI helper.
 *
 * Not a registry like venue-registry.ts: that one carries press-outlet
 * metadata (domain, country, kind) for canonical-name resolution + linking.
 * Academic journals don't need any of that here — just a yes/no tier flag.
 */
export type JournalTier = 'top' | null;

/** Springer Nature family — every title starts with "Nature" + word boundary
 *  ("Nature", "Nature Communications", "Nature Reviews Genetics", …).
 *  "Nature" is a Springer Nature trademark on journal titles, so this prefix
 *  is safe; legitimate non-Nature-family journals starting with "Natural"
 *  (e.g. "Natural Hazards") fail the boundary check. */
const NATURE_FAMILY = /^nature\b/i;

/** AAAS Science family — explicit list. Prefix-matching "Science" would
 *  catch "Science of the Total Environment" (Elsevier), "Science China
 *  Mathematics" (Springer), "Science as Culture" (Taylor & Francis), and
 *  any number of journals that share the word without sharing the
 *  publisher. Compared case-insensitively against the trimmed input. */
const SCIENCE_AAAS = new Set([
  'science',
  'science advances',
  'science translational medicine',
  'science immunology',
  'science signaling',
  'science robotics',
]);

export function journalTier(
  journal: string | null | undefined,
): JournalTier {
  if (!journal) return null;
  const trimmed = journal.trim();
  if (!trimmed) return null;
  if (NATURE_FAMILY.test(trimmed)) return 'top';
  if (SCIENCE_AAAS.has(trimmed.toLowerCase())) return 'top';
  return null;
}
