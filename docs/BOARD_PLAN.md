# Redaktionsboard — Projektplan (MeisterTask-Ablösung)

Stand: 2026-07-03 · Status: **Planung** · Vorbild-Analyse: MeisterTask-Board „Channels" (pKbTh8rA)

## 1. Ziel

Das Press-Tool wird um ein Kanban-Redaktionsboard erweitert, das die vom Team
tatsächlich genutzte MeisterTask-Logik abbildet und MeisterTask mittelfristig
ablöst. Der strukturelle Mehrwert gegenüber MeisterTask: Die Triage
(Events/Publikationen) speist das Board direkt — aus einer „pitchen"-Entscheidung
wird eine vorbefüllte Karte.

**Nicht-Ziele:** Tags, Abhängigkeiten, Zeiterfassung, Automationen,
native Mobile-App (responsive Mobile-Ansichten sind im Design enthalten
und werden umgesetzt — Board, Modal, Navigation),
personenzentrierte Ansichten (Agenda/„Meine Aufgaben"-Dashboard, s. §2),
Benachrichtigungen/Erwähnungen (später optional, wenn das Team sie vermisst).
Das Team nutzt nichts davon; das Board bleibt bewusst leichtgewichtig.

## 2. Ist-Analyse

### Was das Team in MeisterTask verwendet (verifiziert 2026-07-03)

- **Spalten = Ausspielkanäle** (nicht Workflow): PM/Presse · Web · Blog GÖ ·
  Podcast · Events · Screens · Science Pop · Zeitlos. Karten wandern bei
  Kanalwechsel (z. B. Web → Events).
- **Karte = Thema/Story.** Drei wiederkehrende Muster:
  1. *Event-Coverage*: Beschreibung = ÖAW-Link + Speaker; Checkliste =
     Formate („Web-Interview (zugesagt)", „Fotos"); Fälligkeit = Eventdatum.
  2. *Themencluster* (z. B. IRAN-Themen): Checkliste = Winkel mit Experte +
     Owner **im Freitext** („Huthis…? Brand – Christine fragt an"); freigegebene
     ITVs als DOCX-Anhang (`YYYYMMDD_Thema_ITV_Name_freigegeben`).
  3. *Serien-Backlog* (Zeitreise-Podcast): Unteraufgaben = Episodenkandidaten;
     konkrete Folgen werden eigene Karten mit Publikationsdatum.
- **Genutzte Features:** Checklisten, Unteraufgaben, Anhänge, Kommentare,
  Fälligkeit (+ Überfällig-Warnung), Aktivitätslog, Karte abschließen
  (durchgestrichen), mehrere Boards (Web-Team, Lange Nacht, Social Media
  Planung, CD Relaunch, …).
- **Kultur:** Karten meist ohne Assignee (123/~200) — Ownership steht im
  Checklisten-Text. Beobachter statt Zuweisung.
- **Globale MT-Ansichten — Nutzungsbefund (2026-07-03):** Start-Dashboard
  („mir zugewiesen"-Widget, Benachrichtigungen) und Agenda (persönliches
  Pin-Board) sind **leer/ungenutzt** — ohne Zuweisungs-Kultur funktionieren
  sie nicht. Berichte = Report-Builder (gelegentlich nützlich). Notizen/
  Mind Maps = separate Meister-Produkte. → Wir bauen personenzentrierte
  Ansichten NICHT nach; stattdessen globale Kartensuche (⌘K, shadcn
  `command` vorhanden) + Dashboard-Kachel fällig/zuletzt erstellt.

### Relevanter Bestand im Repo

| Baustein | Stand | Konsequenz |
| --- | --- | --- |
| Auth | Passwort-Gate (`proxy.ts`, Cookie `gate`), **kein** Supabase Auth; `users`/`user_settings` als Stub vorhanden | Supabase Auth neu verdrahten (Phase 1); Gate bleibt als äußere Hülle |
| Datenfluss | API-Routen (`withApiError` + Zod) + TanStack React Query, **keine** Server Actions | Board folgt exakt diesem Muster |
| Migrations | Supabase-SQL = Source of Truth; schema.ts hand-mirrorn (NICHT `db:introspect`) | bekanntes Vorgehen |
| RLS | überall ENABLE (nicht FORCE); Drizzle läuft als service-role daran vorbei | neue Tabellen mit `authenticated`-Policies → Voraussetzung für Realtime |
| Storage | MinIO via `lib/server/storage/s3.ts`, Proxy-Auslieferung (Social-Bilder) | Anhänge übernehmen dasselbe Muster (`board/attachments/<id>`) |
| DnD | keine Library vorhanden | **dnd-kit** einführen |
| MeisterTask | One-Way-**Push existiert** (`lib/server/meistertask/`, `events.meistertask_task_id`, API-Token in env) | API-Zugang für Import fertig; gepushte Karten beim Import re-linken |

## 3. Architekturentscheidungen

1. **Supabase Auth für Identität** (`@supabase/ssr`): E-Mail + Passwort,
   Accounts werden admin-seitig angelegt (10 Personen, keine Self-Signups).
   Das Passwort-Gate bleibt vorerst unverändert davor — Auth liefert nur
   Identität für Kommentare/Aktivität/Beobachter. Ablösung des Gates ist ein
   späterer, separater Schritt.
   **Rollenmodell (minimal):** `users.role ∈ admin|member`. Member dürfen
   alles Inhaltliche inkl. Spalten anlegen (MT-Kultur); Admin zusätzlich
   Nutzerverwaltung (anlegen/deaktivieren/Rolle/Passwort-Reset) und
   Board-Verwaltung (anlegen/umbenennen/archivieren). Nutzer werden
   **deaktiviert, nie gelöscht** (`disabled_at`) — Kommentar-/Aktivitäts-
   Autorschaft muss Personalwechsel überleben. Durchsetzung server-seitig
   (`requireUser()`/`requireAdmin()`); Passwort-Reset durch Admin via
   Supabase-Admin-API (kein SMTP-Setup auf Free Tier).
2. **Realtime-ready ab Tag 1, Realtime-on in Phase 3.** Kostenpunkte, die
   sich nicht nachrüsten lassen, werden sofort richtig gebaut:
   - **Fraktionale Ranks** (Sortier-String zwischen Nachbarn, LexoRank-Stil)
     statt Integer-Positionen → parallele Moves kollidieren nicht.
   - **Ein** React-Query-Store für optimistische Updates; Realtime-Events
     (`postgres_changes`) werden später nur zusätzliche Invalidierungs-Quelle.
   - RLS-Policies für `authenticated` von Anfang an (Realtime autorisiert
     über RLS). Free-Tier-Limits (200 Verbindungen, 2 Mio. msgs/Monat) sind
     bei 10 Nutzern irrelevant.
3. **Checkliste und Unteraufgaben = eine Tabelle** (`card_items` mit
   `kind ∈ checklist|subtask`) — identisches Verhalten (Text, abhakbar, Rank),
   nur andere Darstellung.
4. **Aktivitätslog append-only** (Vorbild: `event_score_weights`-History) —
   bigserial, `verb` + `payload jsonb`, wird nie mutiert.
5. **Karten-Abschluss als `completed_at`** auf der Karte (MeisterTask-Stil:
   durchgestrichen in der Spalte), keine „Done"-Spalte.
6. **Enums als text + CHECK** (Repo-Konvention); vor jedem CHECK die
   Writer-Analyse (siehe Memory `pg-check-pre-flight`).

## 4. Datenmodell (neue Tabellen)

```
users                    -- Stub existiert; an auth.users koppeln (id = auth.uid()),
                         --   display_name, role check(admin|member), disabled_at
boards                   -- id uuid, name, slug, rank, archived_at
board_columns            -- id, board_id FK, name, color, rank
cards                    -- id, board_id, column_id, title, description_md,
                         --   link_url text NULL (ÖAW-Link als eigenes Feld,
                         --   Triage befüllt es; Design zeigt ihn als Chip),
                         --   rank, due_at, completed_at, created_by,
                         --   assignee_id FK NULL (kaum genutzt, aber MT-Personen-
                         --   leiste braucht es), converted_from_item_id FK NULL,
                         --   source_event_id FK NULL, source_publication_id FK NULL,
                         --   meistertask_task_id text NULL (Import-Idempotenz),
                         --   created_at, updated_at
user_board_favorites     -- user_id, board_id (PK beide; Stern im Switcher/Übersicht)
card_items               -- id, card_id, kind check(checklist|subtask), text, rank,
                         --   done_at, done_by
card_watchers            -- card_id, user_id (PK beide)
card_comments            -- id, card_id, author_id, body_md, created_at, edited_at
card_attachments         -- id, card_id, filename, s3_key, content_type, size_bytes,
                         --   uploaded_by, created_at
card_activity            -- bigserial, card_id, actor_id, verb, payload jsonb, created_at
```

Indizes: `cards(board_id, column_id, rank)`, `cards(due_at)`,
`card_items(card_id, rank)`, `card_activity(card_id, id)`.
RLS: alle Tabellen ENABLE + Policies für `authenticated` (select/insert/update/
delete); Drizzle-Serverpfad prüft Zugriff selbst (wie im Restsystem).

**DB-seitige Invarianten (gehören in die Phase-2-Migration, nicht nur in den
App-Code):**

- **Ranks:** alle `rank`-Spalten als `text COLLATE "C" NOT NULL CHECK
  (rank ~ '^[a-z]*[b-z]$')`. `COLLATE "C"` = bytewise, damit `ORDER BY rank`
  exakt dem JS-Codeunit-Vergleich aus `lib/shared/rank.ts` entspricht
  (locale-Collation könnte theoretisch abweichen). Der CHECK erzwingt die
  Modul-Invariante (nie auf `a` endend — sonst kein Midpoint mehr möglich).
  Zusätzlich UNIQUE je Geltungsbereich (`cards(column_id, rank)`,
  `board_columns(board_id, rank)`, `card_items(card_id, rank)`): macht
  Race-Kollisionen zweier gleichzeitiger Moves zu einem retrybaren Fehler
  statt stiller Fehlordnung; Server-Move-Pfad fängt 23505 und rechnet neu.
- **Enums:** `card_items.kind`, `users.role` als text + CHECK
  (Writer-Analyse vor jedem CHECK, Memory `pg-check-pre-flight`).
- **Append-only `card_activity`:** BEFORE UPDATE/DELETE-Trigger mit RAISE —
  RLS allein reicht nicht, weil der Drizzle-Serverpfad als service-role an
  RLS vorbeigeht. (Keine UPDATE/DELETE-Policies gibt es zusätzlich.)
- **Löschregeln als FKs:** `cards.column_id` / `cards.board_id` ON DELETE
  RESTRICT (das „Spalte enthält Karten"-Warnmodal im Design ist die UI dazu —
  die DB garantiert es hart); `card_items`/`card_watchers`/`card_comments`/
  `card_attachments`/`card_activity` → CASCADE zur Karte;
  `source_event_id`/`source_publication_id`/`converted_from_item_id` →
  SET NULL; Autoren-FKs (`created_by`, `author_id`, `actor_id`, `done_by`)
  RESTRICT — Nutzer werden nie gelöscht, nur deaktiviert (§3.1).
- **`updated_at`** via Trigger (`moddatetime` o. ä.), nicht app-seitig —
  gilt dann auch für Realtime-/SQL-Schreibpfade.

## 5. Phasen

### Phase 0 — Design & Entscheidungen ✅ (2026-07-03)
- [x] Claude-Design-Entwurf erstellt (2026-07-03): Board / Kartenmodal /
      Triage-zu-Karte, Verwaltungs-Screens, Board-Übersicht + Switcher,
      Login, **inkl. Mobile-Ansichten**
- [x] Design per DesignSync geholt und gegen Plan §5 abgeglichen
      (Ergebnis unten). Quelle: Claude-Design-Projekt „Designsystem für
      OEAW-Press-Relevance" (`7e47982d-6cf6-4220-b07c-bfb3ca491569`;
      taucht in `list_projects` NICHT auf — kein Design-System-Projekt —
      Dateien via `get_file` mit dieser ID). Lokale Kopien aller 5 Screens
      + Runtime: **`docs/design/board/`** (`.dc.html` = HTML-Template +
      `data-dc-script`-Logik; braucht zum Rendern die Claude-Design-Umgebung,
      als Spez lesbar).
- [x] Route: **`/board`** = Board-Übersicht, **`/board/[slug]`** = einzelnes
      Board (konsistent zu `/events`, `/social`; Nav-Label „Board" wie im
      Design).
- [x] Rank-Utility: `lib/shared/rank.ts` (`rankBetween`, `initialRanks`,
      `RANK_PATTERN`) + 20 Tests in `rank.test.ts`. Midpoint-Algorithmus
      über `a–z`, erzeugte Keys enden nie auf `a`; DB-Seite s. §4.

#### Phase-0-Ergebnis: Design-Abgleich (2026-07-03)

Der Entwurf deckt §5 weitgehend ab (Board, Karten-Chips mit allen Badges,
Kartenmodal inkl. Verschieben/Abschließen/Convert, Personen-Leiste,
Filterleiste, Triage-Modal, ⌘K-Palette, Login, Verwaltung, Mobile als
Bottom-Sheets + Kanal-Tabs + Quick-Add-FAB). Abweichungen und Folgerungen:

**Design vereinfacht — Plan angepasst:**
- **Kein Spalten-Drag im Board**: Spalten-Reihenfolge lebt in der Verwaltung
  (dort per Drag); dnd-kit im Board nur für Karten. Übernommen.
- **Karten-Drag nur zwischen Spalten** (Drop = Kanalwechsel), keine manuelle
  Sortierung innerhalb der Spalte designt. Ranks bleiben im Datenmodell
  (Sortierung innerhalb der Spalte = rank; Drop hängt ans Spaltenende an,
  In-Spalte-Sortierung kann später ohne Schemaänderung kommen).

**Im Design, aber nicht im Plan — übernehmen:**
- Filterleiste zusätzlich: **Kanal-Filter** + Toggle **„Erledigte zeigen"**
  (nötig, weil erledigte Karten durchgestrichen in der Spalte bleiben);
  Suche matcht Titel **und** Checklisten-Texte.
- Fälligkeits-Badge mit „soon"-Zustand (≤3 Tage, orange) neben überfällig/rot.
- Personen-Leiste matcht Assignee ∨ Beobachter ∨ **Vorname im
  Checklisten-Freitext** (MT-Kultur „Ownership im Text"; bewusst unscharf).
- Kanal-Icons für die 8 Channels als Name→Icon-Mapping im Client (keine
  DB-Spalte; generische Boards haben keine Icons).
- Login-Fehlerzustände, Avatar-Menü mit Abmelden (Phase 1).
- Mobile Quick-Add-FAB (nur Titel, Kanal = aktiver Tab).
- `cards.link_url` als eigenes Feld (Design zeigt ÖAW-Link als Chip getrennt
  von der Beschreibung) — in §4 ergänzt, ebenso `user_board_favorites`.

**Im Design, aber NICHT übernehmen:**
- Karten-Referenznummer `#PRES-0471` (bräuchte Sequenz; rein kosmetisch → v1 ohne).
- „Karte anlegen" + Spalten-„+" öffnen im Mock das Triage-Modal — in echt:
  schlankes Quick-Create-Formular; Triage-Modal nur für „Aus Triage anlegen".

**Plan-Punkte ohne Design (bewusst offen, beim Bauen ergänzen):**
- Beschreibung **bearbeiten** (Modal zeigt sie read-only), Datepicker für
  Fälligkeit im Modal, Beobachter-**Picker** (Button ohne Funktion),
  Anhang-Upload-Flow (P3), Publikationen-Variante des Triage-Modals (P4),
  Score-Kontext im Prefill (P4), sichtbare Karte↔Event-Verknüpfung (P4),
  Dashboard-Kachel (P4), „Karte verschieben" am Mobile-Sheet.

**Sonstiges fürs Bauen:** Aktivitäts-Verben aus dem Mock als `verb`-Vokabular
(created, item_checked, attachment_added, moved, due_set, completed, reopened,
created_from_triage, created_from_subtask; von/nach im `payload`); Server
schreibt Activity bei create/move/complete/convert selbst; Esc-Kaskade
(Palette→Switcher) und Enter-Semantik (neuer Eintrag/Kommentar/Login) global;
„zuletzt aktiv" pro Board aus `card_activity` ableiten (kein Denormalisieren
in v1); Convert-Lookup in beide Richtungen über `cards.converted_from_item_id`.

### Phase 1 — Identität (Supabase Auth) ✅ (2026-07-03)
- [x] `@supabase/ssr` eingebaut — bewusst OHNE Browser-Supabase-Client:
      alle Auth-Flüsse laufen über `/api/auth/*` (login/logout/me), dadurch
      können die Session-Cookies httpOnly + sameSite=strict sein
      (`lib/server/auth/client.ts`). Login-UI unter `/login`
      (Vollbild-Overlay nach Design), Avatar-Menü mit Abmelden in der Nav.
- [x] `users`-Stub an `auth.users` gekoppelt (Migration
      `20260703000001_users_auth_link.sql`): FK id→auth.users (CASCADE;
      Phase-2-Autoren-FKs mit RESTRICT verhindern dann das Löschen von
      Nutzern mit Inhalten), role admin|member, `disabled_at`,
      Spiegel-Trigger `on_auth_user_created` + E-Mail-Sync-Trigger,
      RLS-Policy `authenticated_select`. **Gotcha:** GoTrue merged custom
      `app_metadata` erst NACH dem Insert — der Trigger sieht die Rolle
      nie, `createAdminUser` setzt sie explizit nach.
      Accounts werden über die Nutzerverwaltung angelegt (Initial-Admin
      in prod via Admin-API seeden).
- [x] `useCurrentUser`-Hook (mit Hydration-Gate — React 19 hydriert
      Subtrees verzögert, s. Kommentar im Hook) + `requireUser()`/
      `requireAdmin()` (`lib/server/auth/require.ts`, wirft `ApiAuthError`
      → withApiError antwortet 401/403).
- [x] Nutzerverwaltung in `/settings` (admin-only, Design Verwaltung.dc):
      Liste (Rolle/Status/letzte Anmeldung/„Neu"), Anlegen mit generiertem
      Initialpasswort (einmalige Anzeige, kein SMTP), Deaktivieren
      (= `disabled_at` + auth-Ban; Alt-JWTs blockt requireUser sofort),
      Rolle ändern, Passwort-Reset. Server-Guards: keine
      Selbst-Deaktivierung, letzter aktiver Admin unantastbar.
- [x] Gate unangetastet (proxy.ts unverändert); Dev-Bypass wie gehabt
      (Gate aus in development, Supabase-Auth läuft auch in dev).
- [x] Tests: pure Auth-Helper + Guards + Schemas (Unit) und RLS-/Auth-Smoke
      gegen den lokalen Stack (Trigger, anon-Blockade, authenticated-Select,
      Ban, CASCADE, createAdminUser-Regression); Suite skippt sauber ohne
      lokalen Stack und läuft nie gegen prod (localhost-Guard).

### Phase 2 — Board-Kern ✅ (2026-07-03)
- [x] Migration: Tabellen aus §4 + RLS + Seed (Board „Channels" mit 8 Spalten).
      `20260703000002_board_core.sql`; ALLE §4-Invarianten (rank COLLATE "C" +
      CHECK + UNIQUE(scope,rank) mit 23505-Retry, append-only card_activity
      BEFORE UPDATE/DELETE-Trigger via `pg_trigger_depth()` — empirisch
      verifiziert: direkt=1 verboten, Cascade=2 erlaubt, FK-Löschregeln
      RESTRICT/CASCADE/SET NULL, updated_at-Trigger). Lokal angewendet +
      per DB-Smoke-Test alle Invarianten grün. **prod-Migration noch offen.**
- [x] Board-Verwaltung in `/settings` (`board-management-card.tsx`, self-gated):
      Boards anlegen/archivieren (admin), Spalten anlegen/umbenennen/Farbe/
      Reihenfolge per dnd-kit (alle Member), „Spalte enthält Karten"-Warnmodal.
- [x] schema.ts hand-mirrorn; `check-schema-drift` grün (44/44).
- [x] `lib/server/board/*.ts` (CRUD, Move mit Rank-Neuberechnung + 23505-Retry,
      Aktivität schreiben, Convert). End-to-end Vitest-Integrationstest grün.
- [x] API-Routen `app/api/board/*` (withApiError + Zod, requireUser/-Admin,
      Schemas in `lib/shared/board-schemas.ts`).
- [x] Board-Übersicht `/board` (Grid + Favoriten-Stern + Archiv + „Neues Board"
      admin) + Board-Switcher im Header (Popover, Favoriten/Suche/aktuelles Board).
- [x] Board-UI `/board/[slug]`: Spalten + Karten-Chips (Fälligkeit soon/overdue/
      Fortschritt/Zähler/Beobachter-Avatare), dnd-kit Karten-Drag, optimistische
      Moves. **Rank-Sortierung client-seitig via `compareRank` (bytewise, matcht
      COLLATE "C") — NICHT localeCompare (Review-Fund).**
- [x] Kartenmodal: Titel + Beschreibung editierbar, Checkliste/Unteraufgaben
      (Enter/abhaken/löschen), Fälligkeit, Beobachter, Assignee, Abschließen,
      Kanal-/Board-Wechsel („Verschieben"-Popover), Metadaten, Aktivitäts-Strang.
- [x] **Unteraufgabe → eigene Karte umwandeln** (`converted_from_item_id`,
      Rück-Lookup `converted_card_id`, „Karte öffnen").
- [x] Personen-Leiste rechts (Avatare + Zähler, „Nicht zugewiesen" zuerst,
      Klick = Personen-Filter).
- [x] Filterleiste: Suche (Titel + Item-Texte via `search_text`), Kanal, Person,
      „nur überfällig", „Erledigte zeigen".

**Phase-2-Notizen (fürs Bauen/Review):**
- **Design Book ist ab jetzt toolkit-weit** (User 2026-07-03): `docs/design/
  DESIGN_SYSTEM.md`; Board = Referenzimplementierung. Tokens übernommen; Icons
  vorerst lucide (Mapping §7), Font Geist ist **schon** app-weit (layout.tsx).
- **RLS bewusst nur `authenticated_select`** (nicht die in §4 zusätzlich
  genannten insert/update/delete-Policies): Realtime braucht nur SELECT, es gibt
  keinen Browser-Supabase-Client, alle Writes laufen über die API (owner-Pfad) —
  broad write für `authenticated` würde die Rank-/Activity-Invarianten umgehbar
  machen. Datenintegrität vor Aspiration.
- **Offen für Phase 3:** Kartenmodal ist ein hand-gerolltes Overlay ohne
  Focus-Trap (a11y-Pass in Phase 3 eingeplant); Markdown wird noch als Rohtext
  (Textarea) gezeigt, nicht gerendert → beim Rendern sanitizen.
- **prod-Deploy offen:** Migration `20260703000002` noch nicht auf prod
  angewendet (blockiert wie Phase 1 ggf. durch Egress-Restriction).

### Phase 3 — Kollaboration
- [ ] Kommentare + Aktivitätslog im Modal (ein Strang, MeisterTask-Stil)
- [ ] Anhänge: Upload → MinIO (`board/attachments/`), Proxy-Route analog
      Social-Images, DOCX/PDF/Bilder; Größenlimit
- [ ] Realtime einschalten: `postgres_changes` auf cards/card_items/card_comments
      → Query-Invalidierung; Reconnect-Handling
- [ ] E2E: Board-Grundflow (Karte anlegen, verschieben, abhaken) + a11y-Pass

### Phase 4 — Triage-Integration (der eigentliche Mehrwert)
- [ ] „Karte anlegen" aus Event-Cockpit: vorbefüllt mit Titel, ÖAW-Link,
      Datum, Score-Kontext; Format-Checkliste als Template (Web-ITV / Video /
      Fotos / PM)
- [ ] Dasselbe aus Publikationen (DOI-Link, Autoren)
- [ ] Bestehenden MeisterTask-Push parallel weiterbetreiben (Übergangszeit),
      Karte↔Event-Verknüpfung sichtbar machen (`source_event_id`)
- [ ] Dashboard-Kachel: fällige/überfällige + zuletzt erstellte Karten
- [ ] Globale Kartensuche (⌘K-Palette über alle Boards; shadcn `command`)

### Phase 5 — Migration & Ablösung
- [ ] Import-Script über MeisterTask-API: alle Boards (Channels + Nebenboards),
      Sections→Spalten, Tasks→Karten inkl. Checklisten, Kommentaren (mit
      Autor), Fälligkeit; Anhänge über Download-URLs nach MinIO.
      **Nicht exportierbar:** Aktivitätslog (API gibt den Verlauf nicht her;
      Checklisten-Items ohne Actor-Info) — Historie startet bei null.
      **Token:** user-scoped (sieht nur eigene Boards) und lokal aktuell leer
      (`.env.vercel.production`) → für den Import frischen Token von einem
      Account mit Zugriff auf alle Boards besorgen
- [ ] Idempotenz über `meistertask_task_id`; Re-Link zu Events über den
      bestehenden Push-Datenbestand
- [ ] Personen-Mapping MT-Namen → users
- [ ] Parallelbetrieb (2–4 Wochen), Team-Feedback, dann MT read-only → Kündigung
- [ ] MeisterTask-Push-Code entfernen

## 6. Risiken & Constraints

- **Adoption ist das Hauptrisiko**, nicht die Technik. Kriterium: Board muss ab
  Phase 2 mindestens so schnell bedienbar sein wie MeisterTask (Karte öffnen,
  abhaken, verschieben ohne Wartegefühl). Dauerhafter Parallelbetrieb wäre der
  schlechteste Ausgang — deshalb harter Cutover nach Phase 5.
- **Supabase Free Tier:** 500 MB (aktuell ~391 MB belegt) — Board-Tabellen sind
  klein, aber Anhänge strikt nach MinIO, nie in die DB. Egress-Cap (5 GB/Monat)
  beobachten, sobald Realtime + Attachments live sind.
- **DOCX-Anhänge** sind Blobs ohne Vorschau — Phase 3 liefert nur
  Download-Kacheln; Vorschau ist explizit out of scope.
- **Auth-Umbau** berührt die sicherheitsrelevante Zone (Gate/CSRF/RLS) —
  nach Phase 1 einen fokussierten Security-Review-Pass einplanen.

## 7. Aufwandsschätzung (grob, in Arbeitssessions)

| Phase | Umfang |
| --- | --- |
| 0 | ½–1 |
| 1 | 1–2 |
| 2 | 3–4 (größter Block: Board-UI + DnD) |
| 3 | 2 |
| 4 | 1–2 |
| 5 | 1–2 + Parallelbetrieb |

## 8. Arbeitsmodus (Modell-Staffelung)

- **Fable:** Phase 0 (Rank-Utility), Phase 1 (Auth/Sicherheitszone),
  Phase-2-Auftakt (Migration + RLS + Store-Schnitt) sowie die Review-Pässe
  (Security-Review nach Phase 1; /code-review nach Phase 2 und 5).
- **Opus, effort high:** alle Implementierungs-Sessions ab Phase 2b
  (Board-UI, CRUD, dnd-kit, Modal, Kollaboration, Triage-Integration,
  Import-Script). Medium nur für mechanische UI-Anpassungen.
- Jede Session startet mit diesem Doc + Memory `board-feature-plan`.
