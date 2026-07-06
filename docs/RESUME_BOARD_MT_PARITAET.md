# Resume: Board MeisterTask-Parität

**Stand: 2026-07-06 Nacht — ALLE Kernpunkte dieses Dokuments sind ERLEDIGT**
(Session „arbeite docs/RESUME_BOARD_MT_PARITAET.md ab"). Diese Datei bleibt als
Protokoll + Rest-Backlog.

## ERLEDIGT in dieser Session (in-Browser verifiziert gegen :3005-Prod-Build)

### 1. Emoji-Picker für Kommentare → **frimousse** (Deep-Research bestätigt)
Research-Ergebnis: frimousse (Liveblocks) klar vorn — headless/unstyled (voll
Token-stylebar), dependency-frei, virtualisiert, offizielle shadcn-Registry,
Emoji-Daten zur Laufzeit (emojibase, nicht im Bundle), `locale="de"` (deutsche
Suche verifiziert: „rakete" → 🚀). emoji-mart stale (04/2024, Shadow-DOM),
emoji-picker-react 75 kB gzip + de-Suche erst seit v17 (01/2026).
Implementiert: `emoji-picker-button.tsx` (Popover, next/dynamic) +
`emoji-picker-panel.tsx` (frimousse, Designsystem-Token), Insert an
Cursor-Position im Composer (comment-strand.tsx).

### 2. @-Mentions in Kommentaren
Token `@[Anzeigename]` (id-los, lesbar im Textarea). Server: markdown.ts
rendert `<span class="mention">` über Private-Use-Platzhalter NACH sanitize
(nicht einschleusbar, 7 neue Tests); comments.ts fügt erwähnte aktive Member
als Beobachter hinzu (MT-Verhalten, Namens-Match). Client:
`mention-textarea.tsx` — `@`-Autocomplete-Panel (Filter wie assign-button,
Pfeile/Enter/Tab/Escape, mousedown-Select). Styling: PROSE_CLASS
`.mention`-Pill (brand-50).

### 3. MT-Aktivitätshistorie („X hat die Karte angelegt")
`scripts/backfill-created-activity.mjs` (idempotent): (1) repariert
cards.created_at aus dem MT-Dump (Import hatte die IMPORT-Zeit geschrieben;
Dump hat echte Zeiten je Task via meistertask_task_id); (2) synthetisiert
`created`-Activity aus cards.created_by/created_at (payload.backfilled).
Lokal gelaufen: 292 Karten, Zeiten 2024–2026, echte Attribution
(cards.created_by war korrekt importiert). **Beim Prod-Import mitlaufen
lassen** (`DATABASE_URL=… node scripts/backfill-created-activity.mjs`).
Hinweis: Task-Ersteller steht NICHT im MT-Export-JSON — die Attribution kommt
aus cards.created_by; MTs voller Event-Verlauf (Moves etc.) wäre nur via
GraphQL-Browser-Session nachziehbar (bewusst nicht gemacht).

### 4. Fälligkeit als shadcn Date-Picker
`due-date-picker.tsx`: Button mit de-AT-Label („15. Juli 2026", Intl de-AT)
+ Popover-Calendar (react-day-picker v9 `deAT`-Locale, NICHT v10) + zwei
„Entfernen"-Wege (X am Button, Fußzeile im Popover). Ersetzt beide
`<input type="date">` (Sidebar „Fälligkeit" + ConvertDialog). Wire-Format
unverändert 'YYYY-MM-DD'/''.

### 5. Dokument-Vorschau für Anhänge (Deep-Research bestätigt)
Research: keine externen Viewer (Google/MS = Datenschutz-No-Go;
react-doc-viewer nutzt MS-iframe + wackelige Wartung → raus). Architektur je
Format in `attachment-preview.tsx` (Modal mit Download-Button):
- Bild → `<img>`; PDF → same-origin `<iframe>` nativer Viewer (0 KB Bundle,
  ≤ 4 MB, kein Range nötig; `application/pdf` neu in INLINE_ATTACHMENT_TYPES,
  Begründung im Code); DOCX → mammoth.js dynamic import (semantische
  Näherung) + eigener DOM-Sanitizer; text/* → `<pre>`; Rest (legacy .doc,
  xlsx, pptx, zip) → Fallback mit Download.
- Klick auf Bild-Kachel/Dateiname öffnet die Vorschau (attachments-section).
- **Ausbau-Option:** pixeltreue Office-Vorschau via Gotenberg/LibreOffice-
  Container (Coolify-Service; LibreOffice serialisiert Konversionen,
  restartet sich selbst) — bewusst nicht v1.
- **Nebenbei-Bugfix:** idParamSchema (lib/server/schemas.ts) validierte
  RFC-4122 — MT-importierte Attachment-Ids (stableUuid, gültige pg-uuids ohne
  Versions-Bits) bekamen 400; Download/Vorschau dieser Anhänge war NIE
  erreichbar. Jetzt Postgres-Semantik (8-4-4-4-12 hex).

### 6. Cleanup-Backlog (teilweise)
- formatK + 3× Intl-compact → `lib/shared/format-compact.ts` (einheitlich
  „1,5k"; post-card/social-dashboard/references-section zeigten vorher „Tsd.").
- assign-button: byId-Prop gedroppt (aus members abgeleitet).
- rank-util: columnRankBetween/cardRankBetween → gemeinsamer
  neighborRankBetween-Kern (Staleness-Semantik parametrisiert, unverändert).

## REST-Backlog (bewusst offen, nur Wartbarkeit)
- AuthScreen: useShakeError-Hook + Hell-Palette als Token-Scope (.auth-light).
- AvatarStack extrahieren (card-chip Beobachter + celebration Banner).
- Social-Pool-Aufbau → loadThemePool()-Helper (social/page.tsx + dashboard.ts).
- onDragEnd: Index-Buchhaltung auf dnd-kit `sortable`-Eventdaten umstellen.
- Social-Dashboard: schmale Select statt voller Post-Rows.
- AKZEPTIERTES RISIKO (dokumentiert, nicht fixen ohne User): /api/auth/login
  gate-öffentlich; Schutz = Rate-Limit 5/min/IP (in-memory, pro Instanz).

## Ältere offene Punkte (unverändert)
- Board Canvas-Sync (Memory board-visual-depth); YOUTUBE_CHANNEL_ID-Env in
  Vercel/Coolify; MT-Import nach Prod + Phase 5 MT-Ablösung (BOARD_PLAN.md)
  — **dabei backfill-created-activity.mjs mitlaufen lassen**;
  Board-Mitgliedschaften pro Board, falls Team-Leiste nach Vorkommen nicht
  reicht.

## Arbeits-Gotchas (gültig geblieben + neu)
- **Coolify baut `chore/coolify-dockerfile`**, nicht main — vor jedem
  Coolify-Deploy main hineinmergen. Tunnel: `ssh -fNL 8088:127.0.0.1:8000
  metaspots` (stirbt bei pkill-Aufräumern gern mit!).
- **Playwright-Verify:** Login über die API (`ctx.request.post
  /api/auth/login` — braucht `origin`/`referer`-Header!) +
  `addInitScript(sessionStorage storyscout-auth-marker=1)`, NICHT den
  Klick-Flow (goto() unterbricht die Login-Navigation, Next-Streams hängen).
- Lokaler Test-User authtest.tmp@oeaw.ac.at / &lt;redacted&gt; (disabled_at vor
  Tests auf NULL, danach wieder setzen); card_activity ist append-only →
  Verify-Spuren nur mit `ALTER TABLE … DISABLE TRIGGER
  trg_card_activity_no_delete` (lokal!) löschbar.
- Für in-Browser-Tests eigenen `npm start`-Build auf :3005; :3000 gehört dem
  User. Headless-Chromium rendert PDF-iframes NICHT (kein Viewer) — Header
  prüfen statt Screenshot.
- Emoji-Daten kommen zur Laufzeit von emojibase (jsdelivr-CDN) — nur
  Metadaten, keine Nutzerdaten; offline zeigt das Panel „Lädt…".
