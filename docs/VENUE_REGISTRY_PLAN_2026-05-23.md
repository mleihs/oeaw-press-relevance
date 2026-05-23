# Venue Registry + Filter Dedup + Eligibility Hardening Plan — 2026-05-23

Triggered by: a press-pitch detail page rendered `Journal: Die Presse` for a
publication that is structurally a newspaper article (publication_type 3 =
"Beitrag in Magazin/Zeitung"). Deep-dive found four coupled issues:

1. **UI label is hard-coded** to "Journal" in
   `app/publications/[id]/_components/detail-client.tsx:548`, regardless of
   the venue's actual kind. The list-view `VenueLine` already avoids this
   (its JSDoc even says: *"`enriched_journal` holds a venue, not strictly a
   journal — the publication-type badge says what kind it is"*).
2. **Venues are pure strings** — the app has no notion that "Die Presse" is
   `diepresse.com`, that it's an Austrian newspaper, or that "DerStandard.at"
   and "Der Standard [Blog]" are the same outlet as "Der Standard". The
   corpus has 4 separate spellings of "Der Standard" summing to 87 rows.
3. **Filter facette + URL filter operate on raw stored strings.** A user who
   clicks "Der Standard" in the filter sees 44 of the 87 actual Der Standard
   rows; the other 43 sit under three sibling entries. The list view does
   nothing to collapse these.
4. **Eligibility for type-3 entries hangs on a single per-row flag**
   (`popular_science=true`). All 1973 type-3 rows have it set today, but the
   defense rests on the WebDB import pipeline never drifting on that flag.

This plan delivers (A) a venue registry that gives well-known venues an
identity (canonical name + kind + domain) plus a type-aware detail-page
label; (B) filter deduplication driven by the same registry so list view,
filter URL, and facette all collapse onto canonical groups; (C) a structural
eligibility exclusion for publication type 3.

Three commits, three CI runs, one DB migration (Phase C only).
Behaviour-changing in the UI:
- Phase A: new label and a domain link on the detail page.
- Phase B: filter URLs now expand canonical groups (e.g.
  `?journal=DerStandard.at` returns 87 results instead of 38). Visible UX
  change, intended.
- Phase C: no row count change; the existing popular_science filter already
  covered every type-3 row.

## Environment

- Repo: `/Users/mleihs/Dev/oeaw-press-relevance` — Next.js 16 + Drizzle ORM +
  Supabase/Postgres. CI gate: `npm run typecheck && npm run lint && npm test
  && npm run check-em-dashes` (Node 24). 188 tests baseline before any
  additions in this plan.
- Local Postgres: container from `docker ps | grep supabase_db` →
  `supabase_db_oeaw-press-release` on port 54422.
  `docker exec -i supabase_db_oeaw-press-release psql -U postgres -d postgres`.
- Prod Postgres: pooler URL —
  `grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2-`.
  From inside the local container:
  `docker exec -i supabase_db_oeaw-press-release psql "<pooler-url>"`.
- For long ops via pooler, pipe SQL via heredoc with `SET statement_timeout = 0;`
  prepended.
- After code changes: `git commit` + `git push origin main` (Vercel
  auto-deploys; CI re-runs). Commits go out with a hostname git email —
  cosmetic, ignore.
- Em-dash gate (`npm run lint` for TS, `npm run check-em-dashes` for MDX) is
  active. Keep new TS files free of em-dashes in user-visible strings;
  em-dashes in code comments are fine (the rule's AST selectors skip them).
  Both gates run in CI.

## Context for the resume agent

This section captures the working knowledge from the planning session.
Read it before executing — it has the data findings, the file-locations
already mapped, the architectural decisions and their rationale, plus the
project conventions. With this in hand, the phases below execute cleanly
without re-investigation.

### Corpus snapshot (queried 2026-05-23 on local mirror of prod)

- **Eligible publications (`press_eligible_publications`)**: 7095. Must stay
  7095 after the Phase C migration applies — type-3 rows are already
  excluded via `popular_science=false`. A drop in the count means an
  unexpected non-pop-sci type-3 row exists; STOP and investigate.
- **Publication type distribution by webdb_uid** (the relevant ones):
  - Type 1 = Beitrag in Fachzeitschrift → SCHOLARLY, eligible
  - Type 3 = Beitrag in Magazin/Zeitung → newspaper articles. 1973 rows in
    corpus, **all 1973 have popular_science=true** (verified). This is what
    Phase C hardens into a structural type-based exclusion.
  - Type 4 = Beitrag in Sammelwerk → book chapters
  - Type 16 = Konferenzbeitrag: Publikation in Proceedingsband
  - Excluded today: 5, 7, 8, 13, 15, 19, 23 (Rezension, Diplomarbeit,
    Dissertation, Habilitation, Konferenz-Poster, Skriptum, Lexikon-Stub)
- **Top newspaper-y `enriched_journal` values** (snapshot):
  - Der Standard: 44 + DerStandard.at: 38 + Der Standard [Blog]: 3 +
    Der Standard, Blog: Geschichte Österreichs: 2 = **87 total** for the
    same outlet, currently shown as 4 separate facette entries
  - Die Presse: 27
  - Tiroler Tageszeitung: 10 (+ Tiroler Tageszeitung, Blick von außen: 4)
  - Wiener Zeitung: 7
  - Kleine Zeitung: 6, Thema-ÖAW: 6
  - Kronen Zeitung: 4
  - The `Philosophical Magazine` (20) and `Astronomische Nachrichten` (8)
    hits in the same query are SCHOLARLY journals despite the "magazine"
    /"nachrichten" substring — do not add to the registry.
- **`publication_types` schema**: columns are `id` (uuid), `webdb_uid`
  (int, unique), `name_de` (text), `name_en` (text). NOT `name`. Earlier
  drafts of the plan got this wrong.

### File map

Code locations confirmed during planning. Line numbers are current as of
2026-05-23; re-grep if drifted.

- **VenueLine (list view)**: `components/venue-line.tsx`. 58 lines. Pure
  client component (`'use client'`). Already does NOT use the "Journal"
  label. Click is `router.push('/publications?journal=' + encodeURIComponent(venue))`
  using the RAW stored venue — this is what Phase B changes to use canonical.
- **Detail-page venue section**: `app/publications/[id]/_components/detail-client.tsx`,
  current lines 546–551. Hard-codes `<SectionLabel>Journal</SectionLabel>`.
  Static `<p>`, not clickable. This is what Phase A changes.
- **`extractVenue`**: `lib/server/enrichment/venue-extract.ts`. Parses
  BibTeX `journal`/`booktitle`, RIS `JF`/`JO`/`J2`/`T2`, EndNote `%J`/`%B`.
  Pure, no I/O. Writes into `publications.enriched_journal` via the
  enrichment batch path.
- **`enrichFromWebDb`**: `lib/server/enrichment/webdb-native.ts`. ONLY
  handles `summary_de`/`summary_en` as the abstract fallback. Does NOT touch
  the venue field. Relevant only as confirmation that the WebDB path is not
  another venue source to worry about.
- **Eligibility const**: `lib/shared/eligibility.ts`. Contains
  `ELIGIBILITY_EXCLUDE_TYPE_UIDS` (currently `[5, 7, 8, 13, 15, 19, 23]`,
  ascending). The browser-side mirror of the PG view; smoke pins parity.
- **Eligibility PG view**: `ineligible_publication_types`, created in
  `supabase/migrations/20260516000002_press_eligibility_canonical.sql:34`.
  `press_eligible_publications` is its consumer, was narrowed to 7 columns
  in `20260522000002_press_eligible_publications_narrow.sql`.
- **Eligibility smoke**: `scripts/smoke/eligibility.ts`. Pin #1 asserts
  PG↔TS UID-list parity; pin #2 asserts the view enforces all five
  clauses. Phase C must pass both pins after applying the migration.
- **Filter pipeline (Phase B unknowns — re-grep in pre-flight)**:
  - `lib/server/publications/list.ts` houses a `buildWhere` (or similar)
    that translates filter params into Drizzle conditions. Not read during
    planning. Phase B.1 grep nails it.
  - `app/api/venues/route.ts` likely (or wherever the facette is built).
    Not confirmed. Phase B.1 grep nails it.
  - `app/api/export/csv/route.ts` may also filter by journal. Pre-flight
    grep needs to cover it.

### Architectural decisions (and why)

- **Registry as pure TS, not a DB table.** ~20 known outlets initially,
  edited via PR with the rest of the code, no admin UI needed. YAGNI on
  a `venues` table. Can promote to DB if a future need emerges (admin
  editing, per-tenant lists, etc.).
- **Case-insensitive + whitespace-normalized matching.** "Tiroler
  Tageszeitung", "tiroler tageszeitung", "Tiroler  Tageszeitung" all
  resolve to the same entry. Risk of false positives is small because
  canonical names are full multi-word strings; collisions on lowercased
  whitespace-normalized form are unlikely. Pinned by a test.
- **"Erschienen in" as the unknown-venue fallback label**, not "Journal".
  Honest > convenient. A registry-miss is a real signal — we just don't
  know what kind of venue, so we don't claim one.
- **Aliases as explicit string lists**, not regex. Easier to audit, less
  surprising. Cost: must list each known spelling explicitly. Benefit: a
  reviewer can read the registry and see exactly what collapses to what.
- **`VenueDisplay` is a server component** (no `'use client'`). It's pure
  render with no state. Keeps the bundle smaller.
- **Expansion-only filter logic in `buildWhere`** (Phase B). When
  `?journal=X` matches a registry entry, expand to `ANY(canonical, ...aliases)`.
  Whether `X` is the canonical or an alias does not matter — the user's
  intent is "the outlet", expansion covers it. Unknown venues stay exact
  match (preserves the "raw exact search" fallback for whatever shows up
  in the corpus that's not yet in the registry).
- **`Tageszeitung` for `newspaper` kind** in `KIND_LABEL_DE`, not just
  "Zeitung". More specific, reads natural in German.
- **`KIND_LABEL_DE` is exhaustive over `VenueKind`** — every kind has a
  label, no fallback inside the map. If a new kind is added without a
  label, TypeScript catches it.
- **VenueLine canonical change is BUNDLED with filter expansion (Phase B
  is one commit).** Doing VenueLine canonical without buildWhere expansion
  produces the click-mismatch bug (user clicks "Der Standard" but filter
  returns only 44 of 87). Doing buildWhere expansion without VenueLine
  canonical works but leaves the list view inconsistent with the detail
  page. Atomic together.

### Project conventions (relevant for this plan)

- **German for user-visible text**, English for code/comments/log strings.
- **No em-dashes in user-visible text** — enforced. New TS files in
  `lib/shared/**` are in the ESLint em-dash scope. Use „comma — clean
  prose, sentence split, or parenthetical" per `docs/writing-style.md`.
- **Conventional commits with Co-Authored-By trailer**. End every commit
  body with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Branch is `main`; push directly.** This repo's workflow is
  commit-to-main (see recent log). Hostname-email warning is cosmetic.
- **Vercel deploys on every push to main.** No additional action needed.
- **ESLint boundaries**: `client` may import from `shared` and `client`;
  `components` may import from `shared`, `client`, `components`; `server`
  from `shared` and `server`. The new `venue-registry.ts` is in `shared`
  (importable from everywhere); `venue-display.tsx` is a `component`
  (importable into `app-pages`).

### Trigger publications (manual verification at the end)

Two prod URLs that motivated this plan. Open them after Phase B is
deployed to verify the visible behaviour:

- **Die Presse newspaper article** (Type 3, popular_science=true):
  https://oeaw-press-relevance.vercel.app/publications/0b923528-7d96-43f9-b3fc-1d3d32ed0957
  - Title: "Verkohltes Brot als Zeuge der Vergangenheit"
  - Expected after Phase A: `Tageszeitung: Die Presse  ↗ diepresse.com`
- **Konferenzbeitrag in proceedings volume** (Type 16):
  https://oeaw-press-relevance.vercel.app/publications/5dfee077-3d37-4b8b-a585-df7d99d59b2d
  - Title: "Antike Mythologie und habsburgischer Tugendkodex."
  - `enriched_journal` is the proceedings title (`Pietro Metastasio - uomo
    universale (1698-1782)`), NOT in the registry by design
  - Expected after Phase A: `Erschienen in: Pietro Metastasio - uomo
    universale (1698-1782)` (no domain link, generic label)

And one URL that motivates Phase B specifically:
- https://oeaw-press-relevance.vercel.app/publications?journal=DerStandard.at
  - Today: 38 results (only the exact "DerStandard.at" rows)
  - Expected after Phase B: 87 results (whole Der Standard canonical group)
  - Same URL with `?journal=Der+Standard` → same 87 results

## Phase A — Venue Registry + Type-aware Label

### A.1 — Create `lib/shared/venue-registry.ts`

New file. Exports `VenueKind`, `VenueMetadata`, `KNOWN_VENUES`,
`lookupVenue(name)`, `venueDisplayLabel(name)`. Pure TS, no I/O, no DB.

```ts
/**
 * Curated registry of well-known venues (newspapers, magazines, …) that
 * publication enrichment commonly hits. Lets the UI render a venue kind
 * and an authoritative domain link instead of treating every venue as a
 * scholarly journal, and lets buildWhere expand a filter param onto the
 * full canonical group when the corpus stores the same outlet under
 * several spellings.
 *
 * Source of truth is this TS file; an entry is "known" if its
 * canonicalName matches (whitespace-collapsed, case-insensitive) or one
 * of its aliases does. Unknown venues fall back to a generic "Erschienen
 * in" label, no domain link, and strict exact-match filtering — honest,
 * never a false "Journal" claim and no surprise expansion.
 *
 * Extending: add an entry to KNOWN_VENUES below. For aliases, include any
 * spelling that has shown up in `enriched_journal` for the same outlet
 * (e.g. "DerStandard.at", "Der Standard [Blog]" both alias "Der Standard").
 * The corpus query to surface candidate aliases for an outlet:
 *
 *   SELECT enriched_journal, count(*)
 *   FROM publications
 *   WHERE enriched_journal ILIKE '%<outlet-keyword>%'
 *   GROUP BY enriched_journal ORDER BY count(*) DESC;
 */

export type VenueKind =
  | 'newspaper'
  | 'magazine'
  | 'journal'
  | 'proceedings'
  | 'collection'
  | 'publisher'
  | 'institution';

export interface VenueMetadata {
  canonicalName: string;
  kind: VenueKind;
  /** Bare domain without scheme, e.g. 'diepresse.com'. */
  domain?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. 'AT'. */
  country?: string;
  /** Other spellings that have appeared as `enriched_journal` for this outlet. */
  aliases?: string[];
}

const KNOWN_VENUES: VenueMetadata[] = [
  // Austrian Tageszeitungen
  { canonicalName: 'Die Presse',             kind: 'newspaper', domain: 'diepresse.com',     country: 'AT' },
  { canonicalName: 'Der Standard',           kind: 'newspaper', domain: 'derstandard.at',    country: 'AT',
    aliases: ['DerStandard.at', 'Der Standard [Blog]', 'Der Standard, Blog: Geschichte Österreichs'] },
  { canonicalName: 'Kronen Zeitung',         kind: 'newspaper', domain: 'krone.at',          country: 'AT' },
  { canonicalName: 'Kleine Zeitung',         kind: 'newspaper', domain: 'kleinezeitung.at',  country: 'AT' },
  { canonicalName: 'Wiener Zeitung',         kind: 'newspaper', domain: 'wienerzeitung.at',  country: 'AT' },
  { canonicalName: 'Tiroler Tageszeitung',   kind: 'newspaper', domain: 'tt.com',            country: 'AT',
    aliases: ['Tiroler Tageszeitung, Blick von außen'] },
  { canonicalName: 'Salzburger Nachrichten', kind: 'newspaper', domain: 'sn.at',             country: 'AT' },
  { canonicalName: 'Kurier',                 kind: 'newspaper', domain: 'kurier.at',         country: 'AT' },
  { canonicalName: 'OÖ Nachrichten',         kind: 'newspaper', domain: 'nachrichten.at',    country: 'AT' },
  { canonicalName: 'Heute',                  kind: 'newspaper', domain: 'heute.at',          country: 'AT' },

  // Austrian Wochen / Magazine
  { canonicalName: 'Falter',                 kind: 'newspaper', domain: 'falter.at',         country: 'AT' },
  { canonicalName: 'profil',                 kind: 'magazine',  domain: 'profil.at',         country: 'AT' },
  { canonicalName: 'News',                   kind: 'magazine',  domain: 'news.at',           country: 'AT' },
  { canonicalName: 'trend',                  kind: 'magazine',  domain: 'trend.at',          country: 'AT' },
  { canonicalName: 'Thema. Das Forschungsmagazin der ÖAW',
                                             kind: 'magazine',  domain: 'oeaw.ac.at',        country: 'AT',
    aliases: ['Thema - Das Forschungsmagazin der ÖAW'] },

  // Austrian Online
  { canonicalName: 'ORF.at',                 kind: 'newspaper', domain: 'orf.at',            country: 'AT' },

  // German news
  { canonicalName: 'Süddeutsche Zeitung',    kind: 'newspaper', domain: 'sueddeutsche.de',   country: 'DE' },
  { canonicalName: 'Frankfurter Allgemeine Zeitung',
                                             kind: 'newspaper', domain: 'faz.net',           country: 'DE',
    aliases: ['FAZ'] },
  { canonicalName: 'Die Zeit',               kind: 'newspaper', domain: 'zeit.de',           country: 'DE' },
  { canonicalName: 'Der Spiegel',            kind: 'magazine',  domain: 'spiegel.de',        country: 'DE' },

  // Swiss news
  { canonicalName: 'Neue Zürcher Zeitung',   kind: 'newspaper', domain: 'nzz.ch',            country: 'CH',
    aliases: ['NZZ'] },
];

/**
 * Normalize a string for venue matching: trim, collapse runs of whitespace,
 * lower-case. Applied to both the input and the candidate names/aliases so
 * "Tiroler  Tageszeitung", "tiroler tageszeitung" and "Tiroler Tageszeitung"
 * all resolve to the same entry.
 */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Look up a venue by its canonical name or any known alias. Whitespace and
 * case are normalized on both sides. Returns null for unknown venues — the
 * caller decides on the fallback (typically: render the raw string as-is,
 * or filter on exact equality).
 */
export function lookupVenue(name: string | null | undefined): VenueMetadata | null {
  if (!name) return null;
  const n = normalize(name);
  if (!n) return null;
  for (const v of KNOWN_VENUES) {
    if (normalize(v.canonicalName) === n) return v;
    if (v.aliases?.some((a) => normalize(a) === n)) return v;
  }
  return null;
}

/**
 * Full set of corpus spellings for one outlet: the canonical name plus
 * all known aliases. Used by buildWhere to expand `?journal=X` filters
 * onto the whole canonical group. Returns null for unknown venues so the
 * caller can fall back to strict exact-match.
 */
export function venueGroupSpellings(name: string | null | undefined): string[] | null {
  const meta = lookupVenue(name);
  if (!meta) return null;
  return [meta.canonicalName, ...(meta.aliases ?? [])];
}

const KIND_LABEL_DE: Record<VenueKind, string> = {
  newspaper: 'Tageszeitung',
  magazine: 'Magazin',
  journal: 'Journal',
  proceedings: 'Proceedings',
  collection: 'Sammelwerk',
  publisher: 'Verlag',
  institution: 'Institution',
};

/**
 * German UI label for a venue value, driven by the venue's kind in the
 * registry. Drives the SectionLabel on the publication detail page. Falls
 * back to a neutral "Erschienen in" when the venue is unknown to the
 * registry — never a false "Journal" claim.
 */
export function venueDisplayLabel(name: string | null | undefined): string {
  const meta = lookupVenue(name);
  if (!meta) return 'Erschienen in';
  return KIND_LABEL_DE[meta.kind];
}
```

### A.2 — Create `lib/shared/venue-registry.test.ts`

Pin the lookup, display and group-spellings behaviour with focused unit tests.

```ts
import { describe, it, expect } from 'vitest';
import {
  lookupVenue,
  venueDisplayLabel,
  venueGroupSpellings,
} from './venue-registry';

describe('lookupVenue', () => {
  it('finds a venue by exact canonical name', () => {
    const meta = lookupVenue('Die Presse');
    expect(meta).toMatchObject({
      canonicalName: 'Die Presse',
      kind: 'newspaper',
      domain: 'diepresse.com',
      country: 'AT',
    });
  });

  it('collapses corpus variants of Der Standard via aliases', () => {
    expect(lookupVenue('DerStandard.at')?.canonicalName).toBe('Der Standard');
    expect(lookupVenue('Der Standard [Blog]')?.canonicalName).toBe('Der Standard');
  });

  it('resolves an aliased acronym (FAZ → Frankfurter Allgemeine)', () => {
    expect(lookupVenue('FAZ')?.canonicalName).toBe('Frankfurter Allgemeine Zeitung');
  });

  it('matches case-insensitively', () => {
    expect(lookupVenue('die presse')?.canonicalName).toBe('Die Presse');
    expect(lookupVenue('DIE PRESSE')?.canonicalName).toBe('Die Presse');
  });

  it('collapses internal whitespace runs', () => {
    expect(lookupVenue('Tiroler  Tageszeitung')?.canonicalName).toBe('Tiroler Tageszeitung');
  });

  it('returns null for unknown venues', () => {
    expect(lookupVenue('Some Conference Proceedings 2024')).toBeNull();
  });

  it('returns null for null / undefined / empty / whitespace-only', () => {
    expect(lookupVenue(null)).toBeNull();
    expect(lookupVenue(undefined)).toBeNull();
    expect(lookupVenue('')).toBeNull();
    expect(lookupVenue('   ')).toBeNull();
  });
});

describe('venueDisplayLabel', () => {
  it('returns "Tageszeitung" for a known newspaper', () => {
    expect(venueDisplayLabel('Die Presse')).toBe('Tageszeitung');
  });

  it('returns "Magazin" for a known magazine', () => {
    expect(venueDisplayLabel('profil')).toBe('Magazin');
  });

  it('returns "Erschienen in" for unknown venues (no false "Journal")', () => {
    expect(venueDisplayLabel('Some Conference Proceedings Volume')).toBe('Erschienen in');
  });

  it('returns "Erschienen in" for empty input', () => {
    expect(venueDisplayLabel(null)).toBe('Erschienen in');
    expect(venueDisplayLabel('')).toBe('Erschienen in');
  });
});

describe('venueGroupSpellings', () => {
  it('returns canonical + aliases for a known multi-spelling outlet', () => {
    const spellings = venueGroupSpellings('Der Standard');
    expect(spellings).toContain('Der Standard');
    expect(spellings).toContain('DerStandard.at');
    expect(spellings).toContain('Der Standard [Blog]');
  });

  it('returns the same group when input is an alias', () => {
    expect(venueGroupSpellings('DerStandard.at')).toEqual(
      venueGroupSpellings('Der Standard'),
    );
  });

  it('returns just the canonical name when outlet has no aliases', () => {
    expect(venueGroupSpellings('Die Presse')).toEqual(['Die Presse']);
  });

  it('returns null for unknown venues so caller can fall back to exact match', () => {
    expect(venueGroupSpellings('Some Unknown Venue')).toBeNull();
  });
});
```

### A.3 — Create `components/venue-display.tsx`

A small pure-render component used by the detail page. Server component (no
`'use client'`) because it has no state.

```tsx
import { ExternalLink } from 'lucide-react';
import { lookupVenue } from '@/lib/shared/venue-registry';

/**
 * Renders a venue value with optional canonical name + domain link from the
 * venue registry. Used in the publication detail page next to the
 * type-aware SectionLabel. For unknown venues, shows the raw string with no
 * decoration — honest fallback.
 *
 * The canonical name replaces corpus variants like "DerStandard.at" with
 * the authoritative "Der Standard"; the domain (when known) renders as a
 * small external-link decoration that opens the outlet's site in a new tab
 * with proper security attributes.
 */
export function VenueDisplay({ raw }: { raw: string }) {
  const meta = lookupVenue(raw);
  const display = meta?.canonicalName ?? raw;
  return (
    <>
      {display}
      {meta?.domain && (
        <a
          href={`https://${meta.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground/70 hover:text-brand transition-colors"
          aria-label={`${meta.canonicalName} im neuen Tab öffnen`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {meta.domain}
        </a>
      )}
    </>
  );
}
```

### A.4 — Edit `app/publications/[id]/_components/detail-client.tsx`

Two edits. The target is the `{pub.enriched_journal && (…)}` block. Re-grep
for `<SectionLabel>Journal</SectionLabel>` if line numbers shifted.

**Edit 1 — add the imports** (place with the other component / lib imports
near the top of the file):

```tsx
import { venueDisplayLabel } from '@/lib/shared/venue-registry';
import { VenueDisplay } from '@/components/venue-display';
```

**Edit 2 — replace the journal section** (currently around lines 546–551):

```tsx
// Before:
{pub.enriched_journal && (
  <div>
    <SectionLabel>Journal</SectionLabel>
    <p className="text-sm">{pub.enriched_journal}</p>
  </div>
)}

// After:
{pub.enriched_journal && (
  <div>
    <SectionLabel>{venueDisplayLabel(pub.enriched_journal)}</SectionLabel>
    <p className="text-sm">
      <VenueDisplay raw={pub.enriched_journal} />
    </p>
  </div>
)}
```

### A.5 — Verify Phase A locally

```bash
npm run typecheck      # new TS file + new tests should typecheck cleanly
npm run lint           # lib/shared/** is in em-dash scope; new file is clean
npm test               # 188 prior + ~15 new venue-registry tests
npm run check-em-dashes  # sanity
```

All four must be green before commit.

### A.6 — Commit Phase A

```
feat(venue): venue registry + canonical name + domain link in publication detail

A curated registry (lib/shared/venue-registry.ts) gives well-known Austrian,
German and Swiss outlets (Die Presse, Der Standard, Falter, profil, FAZ,
NZZ, …) an identity beyond a free-text string: a canonical name, a venue
kind (newspaper / magazine / journal / proceedings / …), an authoritative
domain (diepresse.com etc.), and a list of corpus aliases that collapse to
the same outlet.

The publication detail page (app/publications/[id]/_components/detail-
client.tsx) used to hard-code "Journal" as the section label for every
venue, which read as a falsehood for newspaper articles (e.g. the
"Verkohltes Brot als Zeuge der Vergangenheit" piece in Die Presse). The
label now comes from venueDisplayLabel(pub.enriched_journal):
"Tageszeitung" for Die Presse, "Magazin" for profil, "Erschienen in" as
honest fallback when the venue is not in the registry.

A small VenueDisplay component (components/venue-display.tsx) renders the
canonical name plus an optional external-link decoration to the venue's
domain. Opens in a new tab with target=_blank + rel=noopener noreferrer.

Initial registry: about 21 outlets covering AT (Die Presse, Der Standard,
Kronen/Kleine/Wiener/Tiroler/Salzburger/OÖ Nachrichten, Kurier, Heute,
Falter, profil, News, trend, Thema-ÖAW, ORF.at), DE (SZ, FAZ, Die Zeit,
Spiegel), CH (NZZ). Aliases collapse the known corpus variants
("DerStandard.at" and "Der Standard [Blog]" both resolve to canonical
"Der Standard"). Match is whitespace-collapsed and case-insensitive.

Tests pin lookupVenue (exact name, alias, acronym, case-insensitive,
whitespace, unknown, empty), venueDisplayLabel (every kind + fallback),
and venueGroupSpellings (the canonical-group expansion that Phase B uses).

Phase A of docs/VENUE_REGISTRY_PLAN_2026-05-23.md. Phase B will wire the
same registry into the filter facette and the list-view VenueLine click so
the canonical group is consistent across the whole app, not just the
detail page.

Local CI gate green (typecheck + lint + check-em-dashes + test).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### A.7 — Push + watch CI

```bash
git push origin main
sleep 15
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

CI must be green before moving to Phase B.

## Phase B — Filter Deduplication via Registry

Closes the half-state Phase A leaves: the detail page renders canonical
"Der Standard", but the list-view VenueLine click target, the
`/publications?journal=` filter query, and the facette aggregation all
still operate on the raw stored variant. Phase B wires the same
`lookupVenue` and `venueGroupSpellings` from `lib/shared/venue-registry`
into all three so the canonical group is the single source of truth
across the whole app.

Three coupled changes, atomic in one commit. Doing them separately would
either ship a click-mismatch bug (canonical click, raw filter, fewer
results than displayed) or a display-inconsistency between detail and
list view.

### B.1 — Pre-flight grep (the resume agent must run these first)

The planning session did not read `buildWhere`, the venues facette route,
or the CSV export route. Locate them:

```bash
# buildWhere and the journal filter handling
grep -n "buildWhere\|journal\|enrichedJournal" lib/server/publications/list.ts | head -30

# Locate the venues API route (facette aggregation)
grep -rn "enriched_journal\|enrichedJournal" app/api --include="*.ts" -l

# CSV export — may also filter by journal
grep -n "journal\|enrichedJournal" app/api/export/csv/route.ts 2>/dev/null

# Does VenueLine have its own test file?
find . -name "venue-line.test.*" -not -path "*/node_modules/*"

# Any e2e visual snapshots that touch the VenueLine?
grep -rln "venue\|Venue" e2e/ 2>/dev/null

# Any other consumers of enriched_journal as a filter
grep -rn "enriched_journal\|enrichedJournal" lib/server --include="*.ts" | head -20
```

Findings inform the exact edits in B.3/B.4/B.5. The pattern is the same
everywhere: when an `enriched_journal` value is the input of a filter or
the key of an aggregation, route it through the registry.

### B.2 — Edit `components/venue-line.tsx`

Two changes inside the component:

```tsx
// Add import:
import { lookupVenue } from '@/lib/shared/venue-registry';

// Inside the component, after the venue trim:
const canonical = lookupVenue(venue)?.canonicalName ?? venue;
// then use `canonical` for:
//   - the displayed text inside <span class="…truncate…">
//   - the `title` attribute on the <button>
//   - the `aria-label` ("Publikationen aus ${canonical} anzeigen")
//   - the router.push URL: `/publications?journal=${encodeURIComponent(canonical)}`
```

The whole render still wraps in the same italic line + BookOpen icon
+ InfoBubble — no structural change, just s/venue/canonical/ in the four
spots above. The `if (!venue) return null;` guard stays before the lookup
(we still skip rendering for empty venues; lookupVenue is only called for
non-empty inputs).

### B.3 — Edit `lib/server/publications/list.ts buildWhere`

The exact current shape needs the B.1 grep to confirm. The change pattern:

```ts
// Add import at top:
import { venueGroupSpellings } from '@/lib/shared/venue-registry';
// import { inArray } from 'drizzle-orm';  // probably already there

// Inside buildWhere, replace the existing journal filter clause
// (which today is likely an eq() on publications.enrichedJournal):
if (filter.journal) {
  const spellings = venueGroupSpellings(filter.journal);
  if (spellings) {
    // Known outlet — expand to all corpus spellings of this canonical group.
    conditions.push(inArray(publications.enrichedJournal, spellings));
  } else {
    // Unknown — strict exact match, preserves raw-string search.
    conditions.push(eq(publications.enrichedJournal, filter.journal));
  }
}
```

The exact local names (`conditions`, `filter`) will follow whatever
buildWhere currently uses; the structure above is the canonical pattern.

If there is a separate test file for buildWhere (likely
`list.test.ts` next to it, or under `lib/server/publications/`), add:

- `filter.journal = 'Der Standard'` → SQL uses `IN (Der Standard, DerStandard.at, Der Standard [Blog], Der Standard, Blog: Geschichte Österreichs)` (i.e. the canonical group).
- `filter.journal = 'DerStandard.at'` (alias input) → same expansion as canonical input.
- `filter.journal = 'Some Unknown Proceedings Volume'` → SQL uses `= 'Some Unknown Proceedings Volume'` (strict).

If no separate test file exists, do not invent one — add the cases to
whatever existing test file covers buildWhere, or skip if it isn't tested
(the runtime smoke is covered by the manual prod URL check at the end).

### B.4 — Edit the venues facette aggregation

The exact file comes from the B.1 grep. Pattern: wherever the route
groups corpus rows by `enriched_journal` and counts them, derive the
grouping key through the registry instead:

```ts
import { lookupVenue } from '@/lib/shared/venue-registry';

// In the aggregation step, replace the raw key with the canonical key:
const key = lookupVenue(row.enriched_journal)?.canonicalName ?? row.enriched_journal;
```

If the aggregation is SQL-side (a Postgres function or a `GROUP BY` in a
Drizzle query) rather than JS-side, the JS post-process can still
re-group: fetch raw rows, group by canonical key in JS, sum counts. The
20 known outlets are small enough that per-row JS regrouping is
negligible compared to the DB roundtrip.

If `app/api/export/csv/route.ts` also accepts a `?journal=` filter, apply
the same expansion pattern as in buildWhere (B.3). The pre-flight grep
in B.1 surfaces this.

### B.5 — Verify Phase B locally

```bash
npm run typecheck      # buildWhere expansion + facette aggregation typecheck
npm run lint           # no em-dashes; boundaries still satisfied
npm test               # buildWhere expansion tests pass
npm run check-em-dashes
```

Plus a manual local check if the dev server is running:

```bash
# Start dev server in another terminal if not running:
# npm run dev
# Then:
curl -s 'http://localhost:3000/publications?journal=DerStandard.at' \
  | grep -o '<title[^>]*>[^<]*</title>'
# Or open the URL in a browser and confirm the count looks like 87, not 38.
```

### B.6 — Commit Phase B

```
feat(filter): venue filter expansion via registry — single canonical group across UI

Phase B of docs/VENUE_REGISTRY_PLAN_2026-05-23.md. Closes the half-state
that Phase A left: the detail page renders canonical "Der Standard", but
the list-view VenueLine, the /publications?journal= filter, and the
facette aggregation still operated on the raw stored variant. The corpus
has four spellings of "Der Standard" summing to 87 rows, today shown as
four separate facette entries returning 44 / 38 / 3 / 2 each.

Three coupled changes driven by the same lib/shared/venue-registry:

- components/venue-line.tsx — display and click target use the canonical
  name (via lookupVenue). The line in the list now matches what the user
  sees on the detail page.
- lib/server/publications/list.ts buildWhere — when ?journal= maps to a
  registry entry, expand to ANY(canonical + aliases) via
  venueGroupSpellings. Unknown venues keep strict exact-match, preserving
  the raw-string search fallback for whatever's not yet in the registry.
- <venues facette route> — group corpus variants under their canonical
  name before counting, so the facette returns one "Der Standard: 87"
  row instead of four separate rows.

Visible UX change: /publications?journal=DerStandard.at now returns 87
results (the whole Der Standard canonical group) instead of 38. The
filter URL acts on intent (the outlet) rather than on exact storage
variant; the same URL with ?journal=Der+Standard returns the same 87.
Single source of truth across detail page, list view, click target,
filter URL, and facette aggregation.

Tests pin: buildWhere expansion for canonical and alias inputs,
unknown-venue strict-match, facette canonical aggregation.

Local CI gate green (typecheck + lint + check-em-dashes + test).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### B.7 — Push + watch CI

```bash
git push origin main
sleep 15
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

CI must be green before moving to Phase C.

## Phase C — Defensive Eligibility: exclude type 3

### C.1 — Create migration `supabase/migrations/20260523000001_ineligible_types_add_magazin_zeitung.sql`

```sql
-- Add publication type 3 ("Beitrag in Magazin/Zeitung") to the canonical
-- ineligible-types view so newspaper / magazine articles never reach the
-- press-pitch eligibility relation (press_eligible_publications).
--
-- Today every type-3 row also carries popular_science=true, which already
-- excludes it via the popular_science=false clause in press_eligible_
-- publications. This migration adds belt-and-suspenders type-based
-- exclusion: the eligibility predicate then no longer depends on a single
-- per-row flag being set correctly by the WebDB import pipeline.
--
-- Mirror: lib/shared/eligibility.ts ELIGIBILITY_EXCLUDE_TYPE_UIDS lists
-- the same UID set. Parity pinned by scripts/smoke/eligibility.ts.

CREATE OR REPLACE VIEW ineligible_publication_types AS
  SELECT id, webdb_uid
  FROM publication_types
  -- Mirror of ELIGIBILITY_EXCLUDE_TYPE_UIDS (lib/shared/eligibility.ts):
  -- 3 Beitrag in Magazin/Zeitung · 5 Rezension · 7 Diplomarbeit ·
  -- 8 Dissertation · 13 Habilitation · 15 Konferenz-Poster ·
  -- 19 Skriptum · 23 Lexikon-Stub.
  WHERE webdb_uid = ANY (ARRAY[3, 5, 7, 8, 13, 15, 19, 23]);

COMMENT ON VIEW ineligible_publication_types IS
  'Canonical PG resolution of press-ineligible publication_types. UID list mirrors lib/shared/eligibility.ts (the browser filter UI needs a TS copy); parity pinned by scripts/smoke/eligibility.ts.';
```

### C.2 — Edit `lib/shared/eligibility.ts`

Insert `3, // Beitrag in Magazin/Zeitung` as the first array element. Result:

```ts
export const ELIGIBILITY_EXCLUDE_TYPE_UIDS = [
  3,  // Beitrag in Magazin/Zeitung
  5,  // Buch- oder Aufsatzbesprechung
  7,  // Diplomarbeit / Bakkalaureatsarbeit
  8,  // Dissertation
  13, // Habilitationsschrift
  15, // Konferenzbeitrag: Poster (in Proceedingsband)
  19, // Skriptum
  23, // kurze Lexikonbeiträge, summarisch
] as const;
```

### C.3 — Apply migration to local

```bash
docker exec -i supabase_db_oeaw-press-release psql -U postgres -d postgres \
  < supabase/migrations/20260523000001_ineligible_types_add_magazin_zeitung.sql
```

Expected: `CREATE VIEW` + `COMMENT` on separate lines.

### C.4 — Apply migration to prod

```bash
POOLER=$(grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials 2>/dev/null | cut -d= -f2-)
if [ -z "$POOLER" ]; then echo "ERROR: PROD_DB_URL_POOLER not found"; exit 1; fi
{ echo "SET statement_timeout = 0;";
  cat supabase/migrations/20260523000001_ineligible_types_add_magazin_zeitung.sql; } \
  | docker exec -i supabase_db_oeaw-press-release psql "$POOLER"
```

Expected: `SET` + `CREATE VIEW` + `COMMENT`.

### C.5 — Verify the smoke + the counts (local + prod)

```bash
# Smoke: PG ↔ TS parity. Fails if ELIGIBILITY_EXCLUDE_TYPE_UIDS still misses 3.
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  npx tsx scripts/smoke/eligibility.ts
# Expected:
#   ok: eligibility UID parity PG↔TS [3,5,7,8,13,15,19,23]
#   ok: press_eligible_publications enforces all five clauses
#   PASS — eligibility canonical smoke

# Local spot-check — count should stay 7095 (type-3 was already
# excluded via popular_science=true on every row, see Context corpus snapshot):
docker exec -i supabase_db_oeaw-press-release psql -U postgres -d postgres \
  -c "SELECT count(*) AS eligible FROM press_eligible_publications;"

# Prod spot-check — same expectation:
docker exec -i supabase_db_oeaw-press-release psql "$POOLER" \
  -c "SELECT count(*) AS eligible FROM press_eligible_publications;"
```

If either count differs from 7095, STOP and investigate — would mean some
type-3 row was eligible by popular_science=false, contradicting the
pre-flight finding and warranting understanding before committing.

### C.6 — CI gate locally

```bash
npm run typecheck && npm run lint && npm test && npm run check-em-dashes
```

All four green.

### C.7 — Commit Phase C

```
chore(eligibility): exclude publication type 3 (Magazin/Zeitung) from press-pitch view

Phase C of docs/VENUE_REGISTRY_PLAN_2026-05-23.md. Adds
publication_types.webdb_uid 3 ("Beitrag in Magazin/Zeitung") to the
canonical ineligible_publication_types view (migration 20260523000001)
and to the lib/shared/eligibility.ts TS mirror. Parity is pinned by
scripts/smoke/eligibility.ts.

Today every type-3 row in the corpus also carries popular_science=true
(verified: 1973 of 1973), so it is already excluded from
press_eligible_publications via the popular_science=false clause. This
migration moves the exclusion from a per-row flag to a structural type
rule. Defense in depth against a future WebDB import that fails to set
the flag, and a clearer statement of intent: "Beitrag in Magazin/
Zeitung" is by definition already press, not a press-pitch candidate.

Eligible count is unchanged at 7095 in both local and prod, which
confirms the migration is correct AND that popular_science=true was
covering every existing type-3 entry. Smoke test passes.

Applied to local + prod via psql. DB-only, no Vercel deploy needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### C.8 — Push + watch CI

```bash
git push origin main
sleep 15
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

## Done criteria

- `lib/shared/venue-registry.ts` exists with about 21 KNOWN_VENUES entries,
  tests pass (~15 new test cases including venueGroupSpellings).
- `components/venue-display.tsx` exists and is rendered by the detail page.
- Detail page renders the type-aware label (`Tageszeitung` for Die Presse,
  `Magazin` for profil, `Erschienen in` for unknowns) and an external-link
  domain decoration when the venue is in the registry.
- `components/venue-line.tsx` displays canonical name and clicks to the
  canonical filter URL.
- `lib/server/publications/list.ts buildWhere` expands `?journal=X` onto
  the full canonical group when X is in the registry; falls back to strict
  exact match for unknown venues.
- Venues facette route aggregates corpus rows under canonical keys.
- Migration `20260523000001` applied to local + prod;
  `press_eligible_publications` count stays at 7095 on both.
- `ELIGIBILITY_EXCLUDE_TYPE_UIDS` in TS mirror lists 3 first.
- Eligibility smoke passes on local (PG ↔ TS parity assertion).
- All three commits on `origin/main`; CI green for each; Vercel deployed.
- Manual visual check on prod (see Context section for full URLs):
  - 0b923528 publication: `Tageszeitung: Die Presse  ↗ diepresse.com`
  - 5dfee077 publication: `Erschienen in: Pietro Metastasio - uomo universale (1698-1782)`
  - `/publications?journal=DerStandard.at`: 87 results, facette shows
    one "Der Standard" entry.

## Explicit out-of-scope (do NOT touch in this plan)

- **Open-Graph enrichment of HTML `website_link` values.** Significant
  scope, fragile (HTML parsing breaks on selector drift), needs caching.
  Defer to its own iteration when a concrete use-case appears.
- **Venue-string normalization at enrichment time** in
  `lib/server/enrichment/venue-extract.ts`. Would rewrite stored values
  retroactively. Risky migration, separate decision.
- **More venues in the registry beyond the initial 21.** Add them as the
  corpus surfaces them or as outlets become relevant; the registry is
  designed to grow.
- **The `press_releases` table and external press-coverage tracking** —
  its own domain, already partly implemented in the project.
- **Variant collapsing in `enriched_journal` at the DB level** (a
  `venue_canonical` shadow column populated by a function). Would be a
  larger schema change; the Phase B approach (expand at query time) gets
  the same UX without rewriting data.

## Resume sequence (for the fresh session)

1. `cd /Users/mleihs/Dev/oeaw-press-relevance`.
2. Read this plan in full — especially the **Context for the resume agent**
   section, which has the corpus snapshot, file map, and decision rationale
   that won't be obvious from the code alone.
3. Pre-flight: `git status` is clean on `main`, `docker ps | grep
   supabase_db` returns one running container.
4. Execute Phase A steps A.1 → A.7 in order. Do not skip A.5 (local CI
   gate must pass before commit). Wait for CI green on the Phase A commit
   before starting Phase B.
5. Execute Phase B steps B.1 → B.7 in order. B.1 (pre-flight grep) is
   critical — it tells you exactly which files B.3/B.4 edit. Wait for
   CI green on the Phase B commit before starting Phase C.
6. Execute Phase C steps C.1 → C.8 in order. The local-apply (C.3) must
   precede the smoke (C.5) — the smoke runs against local. Apply to prod
   only after local + smoke confirm correct.
7. Final manual cross-check on the prod URLs from the Context section:
   - 0b923528 publication detail
   - 5dfee077 publication detail
   - `/publications?journal=DerStandard.at`
   All three should show the expected post-deploy state.
