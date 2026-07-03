# Redaktionsboard — Projektplan (MeisterTask-Ablösung)

Stand: 2026-07-03 · Status: **Planung** · Vorbild-Analyse: MeisterTask-Board „Channels" (pKbTh8rA)

## 1. Ziel

Das Press-Tool wird um ein Kanban-Redaktionsboard erweitert, das die vom Team
tatsächlich genutzte MeisterTask-Logik abbildet und MeisterTask mittelfristig
ablöst. Der strukturelle Mehrwert gegenüber MeisterTask: Die Triage
(Events/Publikationen) speist das Board direkt — aus einer „pitchen"-Entscheidung
wird eine vorbefüllte Karte.

**Nicht-Ziele:** Tags, Abhängigkeiten, Zeiterfassung, Automationen, Mobile-App,
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
                         --   rank, due_at, completed_at, created_by,
                         --   assignee_id FK NULL (kaum genutzt, aber MT-Personen-
                         --   leiste braucht es), converted_from_item_id FK NULL,
                         --   source_event_id FK NULL, source_publication_id FK NULL,
                         --   meistertask_task_id text NULL (Import-Idempotenz),
                         --   created_at, updated_at
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

## 5. Phasen

### Phase 0 — Design & Entscheidungen
- [ ] Claude-Design-Entwurf für Board / Kartenmodal / Triage-zu-Karte
      (Prompt existiert, Session 2026-07-03) → per Design-Sync einholen
- [ ] Routenname festlegen (Vorschlag: `/board`, Board-Auswahl via Slug)
- [ ] Rank-Utility bauen + testen (pure Funktion, vitest)

### Phase 1 — Identität (Supabase Auth)
- [ ] `@supabase/ssr` einbauen; Login-UI (E-Mail+Passwort), Session-Handling
- [ ] `users`-Stub an `auth.users` koppeln (Trigger oder App-seitig), 10 Accounts anlegen
- [ ] `useCurrentUser`-Hook + Server-Helper (`requireUser()`/`requireAdmin()`)
- [ ] Nutzerverwaltung in `/settings` (admin-only): Liste mit Rolle/Status,
      Anlegen (E-Mail + Initialpasswort via Supabase-Admin-API),
      Deaktivieren, Rolle ändern, Passwort-Reset
- [ ] Gate unangetastet lassen; Dev-Bypass-Verhalten klären
- [ ] Tests: Auth-Helper, Rollen-Checks, RLS-Smoke (anon darf nichts auf Board-Tabellen)

### Phase 2 — Board-Kern
- [ ] Migration: Tabellen aus §4 + RLS + Seed (Board „Channels" mit 8 Spalten)
- [ ] Board-Verwaltung in `/settings`: Boards anlegen/umbenennen/archivieren
      (admin), Spalten anlegen/umbenennen/Farbe/Reihenfolge (alle Member)
- [ ] schema.ts hand-mirrorn; `check-schema-drift` grün
- [ ] `lib/server/board/*.ts` (CRUD, Move mit Rank-Neuberechnung, Aktivität schreiben)
- [ ] API-Routen `app/api/board/*` (withApiError + Zod, Schemas in lib/shared)
- [ ] Board-Übersicht als `/board`-Einstieg (Grid: Name, Kartenzahl, zuletzt
      aktiv; „Neues Board" für Admins) + Board-Switcher im Header (Dropdown
      mit Filter — MT-Projektliste, aber flach: keine Mitgliedschafts-Gruppen,
      stattdessen optional Favoriten-Pin)
- [ ] Board-UI: Spalten + Karten-Chips (Fälligkeit/Fortschritt/Zähler-Badges),
      dnd-kit für Karten- und Spalten-Drag, optimistische Moves
- [ ] Kartenmodal: Titel, Beschreibung (Markdown), Checkliste/Unteraufgaben
      (Enter = neuer Eintrag, Klick = abhaken), Fälligkeit, Beobachter,
      Assignee (optional), Abschließen, **Kanal-/Board-Wechsel im Modal**
      („Aufgabe verschieben"), Metadaten (Erstellt/Geändert)
- [ ] **Unteraufgabe → eigene Karte umwandeln** (Zeitreise-Workflow:
      Episodenkandidat wird Karte; `converted_from_item_id` verlinkt zurück)
- [ ] Personen-Leiste rechts (MT-Muster): Avatare mit Karten-Zähler,
      Klick = Filter auf Person; „Nicht zugewiesen" als erste Gruppe
- [ ] Filterleiste: Suche, Person, „nur überfällig" (Muster: /events-Filter)

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
