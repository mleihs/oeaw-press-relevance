# Board Smart-Objekte — Umsetzungsplan (Variante B)

SSOT für das Feature „Smart-Objekte an Board-Karten hängen". Entscheidung: **Variante B**
(typisierte Objekte mit Live-Join für interne Entities + Connector-Registry für externe,
YouTube als erster externer Provider).

## Status: GEBAUT (2026-07-05), P0–P4 in-Browser verifiziert

Alle Phasen P0–P4 umgesetzt und lokal verifiziert (Add/Remove/Refresh, Picker-Tabs,
bidirektionale „Im Board"-Anzeige am Event-Detail, Standard + Atmosphäre). **Abweichungen
vom ursprünglichen Planentwurf** (Architektur-Review):

1. **EINE `card_references`-Tabelle statt drei Link-Tabellen** (`card_event_links`/
   `card_publication_links`/`card_object_links`). Exactly-one-of-CHECK
   (`num_nonnulls(event_id, publication_id, object_id) = 1`), echte FKs mit Cascade,
   partielle Unique-Indexe je Zieltyp. Gründe: globale `created_at`-Ordnung (die UI will
   genau EINE vereinheitlichte Liste), ein refKey (Zeilen-id) für den DELETE-Pfad,
   weniger Indexe (Free-Tier-Budget). `position` entfällt (Ordnung = created_at).
2. **Keyless-Fallbacks:** ohne `YOUTUBE_API_KEY` läuft URL-Paste über **oEmbed**
   (Titel/Kanal/Thumbnail, keine Dauer/Views) und der Eigenkanal-Picker über den
   **Atom-Feed** des Kanals (15 neueste Videos). Mit Key: volle Metadaten + bis zu
   200 Uploads (Uploads-Playlist `UU…`, 1 Einheit/Seite, 15 min prozess-gecacht;
   kein `search.list`).
3. **Orphan-GC:** verliert ein `external_objects`-Eintrag seinen letzten Link, wird er
   samt gespiegeltem MinIO-Thumbnail gelöscht (Invariante Objekt ⇔ ≥1 Link).
4. **Thumbnail-Serving:** same-origin Proxy `GET /api/board/objects/[id]/thumbnail`
   (MinIO-Mirror `board/objects/<id>.jpg`, Fallback Live-Fetch der allow-listed
   Snapshot-URL). Kein Hotlink im Client.

Gebaute Dateien: Migration `20260705000003_card_references.sql`; `lib/server/connectors/
youtube.ts` (+Tests); `lib/server/board/references.ts`; Routen `cards/[id]/references`
(+`[refId]`, +`refresh`), `references/search`, `connectors/youtube/videos`,
`objects/[id]/thumbnail`; Client `lib/client/board-api.ts`; UI `references-section.tsx` +
`add-reference-popover.tsx` (card-modal MainColumn); Activity-Verben `reference_added/
removed` (activity-line.tsx); Smoke-Test-Lifecycle in `board-smoke.test.ts`.

**Offen:** Prod-Migration + Deploy (P5); `YOUTUBE_CHANNEL_ID=UCY3rUdfN-VCjvfUWojWkayQ`
als Env in Vercel/Coolify setzen (sonst nur URL-Paste); optional `YOUTUBE_API_KEY`
für Dauer/Views/200-Uploads-Picker; Social/Podcast als weitere Provider (gleiche Form).

---

Ursprünglicher Plan (historisch, Tabellen-Layout inzwischen wie oben abgewandelt):

## Ziel / Kern-Einsicht

Eine Karte soll **mehrere** „Smart-Objekte" nachträglich über das Board-Interface
referenzieren können (n:m, „bezieht sich auf") — Veranstaltung(en), Publikation(en),
YouTube-Video(s). „Smart" = typisierte Referenz, die Metadaten (Titel/Datum/Score/
Thumbnail/Dauer) zieht, rich rendert und **bidirektional** ist (Event/Pub weiß, welche
Karten es bespielen).

**Herkunft ≠ Verknüpfung:** Die bestehenden `source_event_id` / `source_publication_id`
(schema.ts ~892) bleiben **unverändert** = Entstehungs-Provenienz (1, aus Triage). Die
neuen Referenzen sind die vielen Bezüge. Beide koexistieren.

## Verankerung im Code (Ausgangspunkte)

- **Schema:** `lib/server/db/schema.ts` — `boardCards` (~880), `sourceEventId`/`sourcePublicationId`
  FKs → `events` (658) / `publications` (322); `boards`, `boardColumns`, `boardLabels`, `boardAttachments`.
- **Server-Logik:** `lib/server/board.ts` — u. a. `getCardsForSource` (Rück-Lookup, schon da) +
  Karten-Detail-Assemblierung.
- **Reverse-Lookup existiert:** `app/api/board/cards/for-source/route.ts` (→ „Im Board"-Anzeige
  an Event-Cockpit + Pub-Detail). B **erweitert** das um Referenz-Links.
- **Suche existiert:** `app/api/board/cards/search/route.ts` (⌘K-Kartensuche) — Muster für die
  interne Objekt-Suchpalette.
- **Karten-Detail-Route:** `app/api/board/cards/[id]/route.ts`; Client-API `lib/client/board-api.ts`.
- **Modal-UI:** `app/board/_components/card-modal.tsx` (MainColumn/Sidebar), frisch gebaute
  warme Board-Tokens + Anhang-Thumbnail-Stil (`attachments-section.tsx`) — Referenz-Chips im
  gleichen Stil.
- **Typen:** `lib/shared/board.ts` — `CardDetail` erweitern.
- **Migrationen:** `supabase/migrations/*.sql`; Prod-Apply via **Supabase MCP** (`apply_migration`).
- **MinIO (Bild-Durabilität):** Social-Bild-Store-Util wiederverwenden (s3.metaspots.net) für
  YouTube-Thumbnails → docs/SOCIAL_IMAGES_MINIO_SETUP.md.
- **Env-Muster:** OPENROUTER_API_KEY / APIFY_TOKEN in `.env.example` → neu `YOUTUBE_API_KEY`
  (+ optional `YOUTUBE_CHANNEL_ID` für den Eigenkanal-Picker).

## Datenmodell (Migration, Phase 0)

Intern = echte FKs (immer live). Extern = Registry + Snapshot.

```sql
-- interne n:m-Verknüpfungen (live join, keine Metadaten-Kopie)
create table card_event_links (
  card_id uuid not null references board_cards(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null,
  primary key (card_id, event_id)
);
create table card_publication_links (
  card_id uuid not null references board_cards(id) on delete cascade,
  publication_id uuid not null references publications(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null,
  primary key (card_id, publication_id)
);

-- externe Objekte (Provider-Registry, Snapshot + Refresh)
create table external_objects (
  id uuid primary key default gen_random_uuid(),
  provider text not null,              -- 'youtube' (später 'podcast', 'social')
  external_id text not null,           -- YouTube videoId
  url text,
  snapshot jsonb not null,             -- title, channel, publishedAt, duration, viewCount, thumbnail_url
  thumbnail_object_key text,           -- MinIO-Key (durabel), null = hotlink
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create table card_object_links (
  card_id uuid not null references board_cards(id) on delete cascade,
  object_id uuid not null references external_objects(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null,
  primary key (card_id, object_id)
);
```

(Tabellennamen/`app_users`-FK an die realen Namen in schema.ts angleichen. Danach die 4 Tabellen
**manuell** in schema.ts ergänzen — NICHT `db:introspect` (benennt bestehende Relationen um,
siehe Memory `db-introspect-breaks-schema`). Typen via `mcp__supabase__generate_typescript_types`
gegenchecken.)

## Server + API

- `lib/server/board.ts`: Karten-Detail um `references` erweitern — **eine vereinheitlichte,
  nach `created_at` sortierte Liste** aus Discriminated Union:
  - `{ kind:'event', id, title, starts_at, score, decision, href:'/events/…' }`
  - `{ kind:'publication', id, title, published_at, press_score, href:'/publications/…' }`
  - `{ kind:'youtube', object_id, title, channel, published_at, duration, views, thumbnail_url, url }`
  - Funktionen `addReference(cardId, {kind, internalId|url})`, `removeReference(cardId, refKey)`.
- Bidirektional: `getCardsForSource` erweitern (oder Schwester-Fn) → **Union aus `source_*_id`
  + Referenz-Links**, damit Event-Cockpit/Pub-Detail auch verknüpfte Karten zeigen.
- Routen (neu):
  - `POST   /api/board/cards/[id]/references` — body `{kind, internalId?|url?}`; intern:
    Existenz prüfen; youtube: `parseVideoId` → `fetchVideo` → `external_objects` upsert → Link.
  - `DELETE /api/board/cards/[id]/references/[refKey]`
  - `POST   /api/board/cards/[id]/references/[objectId]/refresh` — YT-Snapshot neu ziehen.
  - `GET    /api/board/connectors/youtube/search?q=…|channel=1` — Eigenkanal-Uploads/Freitext
    für den Picker (quota-schonend: Uploads-Playlist + Cache, `search.list` sparsam).

## YouTube-Connector (`lib/server/connectors/youtube.ts`)

- **API v3, server-seitiger `YOUTUBE_API_KEY`** (öffentliche Videos + eigener öffentlicher
  Kanal → kein OAuth).
- `parseVideoId(url)` — `watch?v=`, `youtu.be/`, `/shorts/`.
- `fetchVideo(id)` → `videos.list?part=snippet,contentDetails,statistics&id=` (**1 Quota-Einheit**;
  Tageslimit 10.000). Liefert Titel, Kanal, `publishedAt`, Thumbnails, Dauer (ISO-8601 `PT#M#S`
  → in Sekunden/`m:ss` parsen), `viewCount`.
- Eigenkanal: `channels.list?part=contentDetails` (`YOUTUBE_CHANNEL_ID`) → Uploads-Playlist-ID →
  `playlistItems.list` (blättern). `search.list` = 100 Einheiten → nur für Freitext, sparsam.
- **Thumbnail-Durabilität:** in MinIO spiegeln (Social-Bild-Util) → kein Hotlink/404. `snapshot`
  cachen + `refreshed_at`; „Aktualisieren" oder Nightly-Refresh.

## UI (`app/board/_components/`)

- **`references-section.tsx`** in MainColumn (nahe Anhänge): rendert die Referenzen als warme
  Smart-Chips/Objekt-Karten (Board-Tokens + Thumbnail-Stil aus Teil 2). YouTube mit Thumbnail +
  Dauer-Badge + Views; Event/Pub mit Datum + Score-Badge (toolkit-weites Mono-Quadrat).
- **`add-reference-popover.tsx`**: „Objekt hinzufügen"-Palette mit Quellen-Tabs
  **Veranstaltung · Publikation · YouTube · Link**. Intern = Live-Suche (Muster `cards/search`).
  YouTube = URL einfügen **oder** aus Eigenkanal wählen.
- Client-API in `lib/client/board-api.ts`: `addReferenceApi`, `removeReferenceApi`, `youtubeSearchApi`.
- Bidirektional: bestehende „Im Board"-Anzeige an Event-Cockpit + Pub-Detail um Referenz-Karten
  erweitern.

## Phasen

- **P0 Migration** — 4 Tabellen (lokal via `supabase`), schema.ts manuell ergänzen, Typen gegenchecken.
- **P1 YouTube-Connector** — env + parse/fetch/list + MinIO-Mirror + `external_objects`-Cache;
  isoliert mit echter Video-ID testen (Skript/Route).
- **P2 Server + Routen** — `references` in CardDetail, add/remove/refresh, Validierung.
- **P3 UI** — references-section + add-reference-popover (interne Suche zuerst, dann YouTube).
- **P4 Bidirektional** — Coverage an Event/Pub (Union source + Referenzen).
- **P5 Politur + Push** — Refresh/Fehlerbilder, in-Browser verifizieren (Standard + Atmosphäre),
  Prod-Migration via Supabase MCP + Vercel/Coolify.

## Offene Entscheidungen (vor P3/P1 klären)

1. **`YOUTUBE_CHANNEL_ID`** vom User holen (für den Eigenkanal-Picker). Ohne den startet P1 mit
   reinem URL-Paste.
2. **Thumbnail:** sofort MinIO-Mirror (empfohlen, Infra da) vs. erst Hotlink.
3. **Social als Provider** jetzt oder später (Plan: später — dieselbe Connector-Form).
4. **UI-Darstellung:** eine vereinheitlichte Referenzliste (empfohlen) vs. nach Typ gruppiert.

## Verifikation

Pro Phase typecheck+eslint; P1 mit echter Video-ID (Metadaten + gespiegeltes Thumbnail); Ende
in-Browser wie Teil 2 (Chip-Render, Add/Remove, Bidirektional auf Event/Pub, beide Erscheinungsbilder).

## Kontext-Notiz

Direkt davor gebaut: **Kartendetail-Design Teil 2** (Ring/Anhang-Thumbnails/warme Sprechblasen+
Flächen) — committet `1d04850`, **noch NICHT gepusht** (Memory `board-visual-depth`). Beim
nächsten Push mitnehmen (Vercel+Coolify, keine Migration).
