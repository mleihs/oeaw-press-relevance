# Board-Spalten-„…"-Menü — Ausbau-Plan (4 Features)

**Ziel:** Das inline Kanalkopf-„…"-Menü (`app/board/_components/board-column.tsx`,
aktuell: Umbenennen / Farbe / Löschen, Commit `489d051`) um vier MeisterTask-
Optionen erweitern: **Aufgaben anordnen**, **Spalte verschieben**, **Ausblenden
für mich**, **Abgeschlossene archivieren** (+ Archiv-System einführen).

Kontext: MeisterTask-Board ist LOKAL importiert (9 Boards/292 Karten, siehe
Memory `meistertask-import`). Board-Feature-Konventionen: fraktionale Ranks
(`lib/shared/rank.ts`, `initialRanks(n)` für Bulk), Schreibpfad über Drizzle/
owner an RLS vorbei, RLS = Realtime-Vorbereitung + Defense-in-Depth,
Aktivitätslog append-only. Spalten dürfen ALLE Member bearbeiten (BOARD_PLAN
§3.1) — kein Admin-Gate.

Reihenfolge nach Aufwand: **2 (verschieben) → 1 (anordnen) → 3 (ausblenden) →
4 (Archiv)**. Nach jedem Feature: `npx tsc --noEmit`, `eslint --max-warnings=0`,
`npm test`, in-Browser verifizieren (MCP-Tab, Board `/board/channels`), commit.

---

## Feature 2 — Spalte verschieben (klein, zuerst)

Backend existiert bereits: `patchColumnApi(id, { before_id, after_id })`
(Reorder via `columnRankBetween`, genutzt in
`app/settings/_components/board-management-card.tsx`). Nur UI + Verdrahtung.

- **board-view.tsx**: `moveColumn(id, dir: 'left'|'right')` — Spalten nach
  `rank` sortieren, Nachbarn bestimmen, `patchColumnApi` mit `before_id`/
  `after_id` des Zielplatzes, dann `invalidateBoard()`. An `BoardColumn`
  durchreichen zusammen mit `index`/`isFirst`/`isLast` (oder die geordnete
  Spaltenliste), damit die Menüpunkte an den Rändern disabled sind.
- **board-column.tsx**: Menüpunkte „Nach links verschieben" / „Nach rechts
  verschieben" (disabled bei erster/letzter). Icons `ArrowLeft`/`ArrowRight`.
- Verifizieren: Spalte wandert, Reihenfolge persistiert nach Reload.

## Feature 1 — Aufgaben anordnen (mittel)

Einmaliges Neu-Ordnen der Karten einer Spalte (kein persistenter Sortiermodus);
danach behalten die Karten ihre neue manuelle Reihenfolge.

- **Repo** `lib/server/board/columns.ts` (oder cards.ts): `sortColumnCards(
  columnId, by: 'due'|'title'|'created')`. Karten der Spalte laden (NUR
  nicht-archivierte, s. Feature 4), sortieren:
  - `due`: `due_at` asc, NULLs ans Ende; `title`: `lower(title)` asc;
    `created`: `created_at` asc.
  - Neue Ränge via `initialRanks(n)` in Sortierreihenfolge zuweisen, **bulk
    UPDATE in einer Transaktion**.
  - ⚠️ GOTCHA `unique(column_id, rank)`: Neue Ränge können mit noch nicht
    aktualisierten Bestandsrängen kollidieren. Zwei-Phasen: erst alle Karten
    auf garantiert freie Temp-Ränge (z. B. Präfix, oder `rank || 'zz'` — muss
    aber `^[a-z]*[b-z]$` erfüllen; sauberer: alle auf `initialRanks` eines
    breiteren Raums, oder innerhalb der Txn per `DEFERRABLE`-Constraint —
    prüfen, ob der Unique deferrable ist, sonst Zwei-Phasen). Am robustesten:
    Txn, Constraint kurz `SET CONSTRAINTS ... DEFERRED` falls deferrable,
    sonst Temp-Phase.
- **API** `app/api/board/columns/[id]/sort/route.ts` (POST, `{ by }` via zod).
- **board-column.tsx**: Untermenü „Aufgaben anordnen" → „Nach Fälligkeit" /
  „Alphabetisch" / „Nach Erstelldatum". `onSort(columnId, by)` → API →
  `invalidateBoard`.
- Verifizieren: Reihenfolge ändert sich sichtbar und persistiert.

## Feature 3 — Ausblenden für mich (mittel, per-User)

Per-Nutzer-Sichtbarkeit einzelner Kanäle. „Für mich" ⇒ pro User, cross-device
⇒ **DB-Tabelle** (nicht localStorage).

- **Migration** `20260705xxxxxx_user_hidden_columns.sql`:
  `user_hidden_columns (user_id uuid fk users on delete cascade, column_id uuid
  fk board_columns on delete cascade, created_at, pk(user_id,column_id))`. RLS
  enable + `authenticated_select using (true)` (wie andere Board-Tabellen;
  Schreibpfad owner). Realtime optional (unnötig, per-User-lokal). schema.ts
  ergänzen (Drizzle-Def analog `cardWatchers`).
- **Repo** `lib/server/board/columns.ts`: `hideColumn(userId,columnId)` /
  `unhideColumn(userId,columnId)`; `listHiddenColumnIds(userId, boardId)`.
- **Board-Load**: `getBoardWithColumns(userId, slug)` läuft schon pro `userId`
  → `hidden_column_ids: string[]` in `BoardWithColumns` mitgeben (Shared-Typ
  `lib/shared/board.ts` erweitern).
- **API** `app/api/board/columns/[id]/hidden/route.ts` (POST verstecken,
  DELETE einblenden; `requireUser`, User aus Session).
- **board-view.tsx**: versteckte Spalten aus der gerenderten Liste filtern;
  kleine Leiste „N ausgeblendet · anzeigen" (setzt sie temporär wieder ein oder
  ruft unhide). **board-column.tsx**: Menüpunkt „Für mich ausblenden".
- Verifizieren: Kanal verschwindet nur für den aktuellen User (Dev-User-
  Switcher testen), bleibt nach Reload weg, „anzeigen" holt zurück.

## Feature 4 — Archiv-System + „Abgeschlossene archivieren" (groß)

Neues Karten-Konzept: **archiviert** (aus dem Board raus, in DB erhalten,
wiederherstellbar). Bislang nur offen/erledigt/gelöscht.

- **Migration** `20260705xxxxxx_card_archive.sql`: `alter table cards add column
  archived_at timestamptz;` + partieller Index
  `create index idx_cards_active on cards (board_id, column_id, rank) where
  archived_at is null;` schema.ts `archivedAt` ergänzen.
- **Archivierte überall ausschließen** (`archived_at IS NULL`) — ALLE Karten-
  List/Count-Queries:
  - `lib/server/board/boards.ts`: `getBoardSummary` card_count (Z. 28),
    `listCardChips` (Z. ~79, WHERE board_id).
  - `lib/server/board/cards.ts`: `CARD_DETAIL_ROW` NICHT filtern (eine
    archivierte Karte soll per Deep-Link/Archiv noch öffenbar sein) — aber
    prüfen, dass Move/Complete auf archivierte sinnvoll bleibt.
  - `lib/server/board/queries.ts`: `searchCards`, `getBoardDashboardCards`,
    `getCardsForSource`, `getCardsForEvents` — je `AND c.archived_at IS NULL`.
- **Karte archivieren/wiederherstellen**: `cardPatchSchema`
  (`lib/shared/board-schemas.ts:115`) um `archived?: boolean` erweitern;
  `patchCard` setzt `archived_at = now()/null`; Activity-Verben
  `archived`/`unarchived` (zu `ACTIVITY_VERBS` in `lib/shared/board.ts`).
- **Spalten-Aktion** `archiveCompletedInColumn(columnId)`: `update cards set
  archived_at=now() where column_id=$1 and completed_at is not null and
  archived_at is null returning id;` + je Karte Activity 'archived'. API
  `app/api/board/columns/[id]/archive-completed/route.ts` (POST).
- **Archiv-Ansicht** (minimal, aber nutzbar): Board-Drawer/Seite
  `/board/[slug]/archiv` ODER Modal — listet archivierte Karten des Boards
  (Titel, Kanal, Datum) mit „Wiederherstellen"-Button (patchCard archived:false).
  Repo `listArchivedCards(boardId)`.
- **board-column.tsx**: Menüpunkt „Abgeschlossene archivieren" → API →
  `invalidateBoard`; Toast „N archiviert". Menüpunkt-Trenner davor.
- Realtime: `cards` ist bereits publiziert; `archived_at`-UPDATE feuert →
  Board invalidiert.
- Prod-Migration separat (via Supabase-MCP `apply_migration`, siehe Memory
  `meistertask-import` §PROD-DEPLOY) — NICHT vergessen vor Code-Deploy.
- Verifizieren: „Abgeschlossene archivieren" leert die erledigten Karten aus der
  Spalte (mit „Erledigte zeigen" AN gegenprüfen), Archiv-Ansicht zeigt sie,
  Wiederherstellen bringt sie zurück; card_count sinkt entsprechend.

---

## Cross-cutting / Gotchas
- **Menü-Struktur** (board-column.tsx, Reihenfolge): Umbenennen · Aufgaben
  anordnen (Sub) · Farbe ändern (Sub) · Nach links/rechts verschieben · Für
  mich ausblenden · —— · Abgeschlossene archivieren · Kanal löschen.
- **Rank-Bulk-Kollision** (Feature 1): Zwei-Phasen oder deferrable Constraint.
- **archived_at überall** (Feature 4): Vergessene Query = Geisterkarten in
  Zählern. Die Liste oben ist vollständig zum Zeitpunkt des Plans — vor Umsetzung
  `grep -rn "FROM cards\|from(cards)\|card_count" lib/server/board` gegenchecken.
- **Tests**: `filter.ts`/`board`-Smoke-Tests ggf. um archived/hidden erweitern.
- **Keine Migration für 1 & 2**, je eine kleine für 3 & 4 (lokal via
  `node`-pg-Ausführung + Datei; Prod via Supabase-MCP).

## Fertigstellung
Nach allen vier: gemeinsamer visueller Sweep, dann mit den bereits offenen
UI-Commits dieser Session (Umbruch/Überfällig/Kanal-Tönung/Assignee-Avatar/
Spaltenkopf-Balken/Textur/Erledigte-aus/„…"-Menü) nach Vercel + Coolify
deployen (Feature 3+4 brauchen die Prod-Migrationen zuerst).
