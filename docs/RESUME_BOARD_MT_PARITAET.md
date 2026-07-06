# Resume: Board MeisterTask-Parität — offene Punkte nach dem 2026-07-06-Marathon

**Stand:** 2026-07-06 Abend. Diese Datei = Einstieg nach Context-Clear.
Trigger-Satz: „arbeite docs/RESUME_BOARD_MT_PARITAET.md ab".

## Was heute alles ERLEDIGT + deployed wurde (nicht erneut anfassen)
Commits `16eb4b8`…`9f62cc7` auf main (Vercel) + Merges auf `chore/coolify-dockerfile`
(Coolify baut NUR diesen Branch — vor jedem Coolify-Deploy main hineinmergen!):
Login-/Gate-Redesign (AuthScreen, immer hell), Umbenennung „ÖAW Presse",
Board-Celebration + Zuweisen-Button, Dashboard-Redesign mit verdrahtetem
Social-Trends-Modul, Karten-DnD-Sortierung (inkl. Konflikt-Semantik before/after),
Bug-Hunt-Fixes (7312a66), Board volle Breite + Kanal-Scroll + Überfällig-Label +
Team-Leiste nach Vorkommen (9f62cc7), item_added-Aktivität, Beobachter-Select-Fix.
Details: Memory `board-celebration-dashboard-shipped` + git log.

## OFFEN 1: Emoji-Picker für Kommentare (User-Wunsch, Deep-Research angefragt)
MeisterTask hat ein Emoticon-Menü am Kommentarfeld (comment-strand.tsx).
User will eine VORGEFERTIGTE, styl-bare Komponente; er bat explizit um
**Deep-Web-Research** vor der Entscheidung. Kandidaten für die Recherche:
- **frimousse** (Liveblocks, 2025): headless/composable Emoji-Picker für React,
  shadcn-kompatibel, klein — vermutlich der beste Fit fürs Designsystem.
- emoji-mart: Klassiker, mächtig, Styling via CSS-Vars (eigenes Shadow-DOM-Look&Feel).
- emoji-picker-react: populär, Theme-Props, weniger frei stylbar.
Kriterien: Bundle-Größe (Kommentarfeld ist im Board-Bundle → dynamic import!),
Tailwind-/Token-Styling, deutsche Suche/Locale, Wartung. Danach: Button neben
dem Kommentar-Submit (comment-strand.tsx), Insert an Cursor-Position.

## OFFEN 2: @-Mentions in Kommentaren (User-Wunsch)
Wie MeisterTask: `@` im Kommentarfeld → Autocomplete über Board-Member
(BoardAvatar + Name), Mention im gerenderten Kommentar hervorheben.
Backend: Kommentar-Markdown-Pipeline (lib/server/board/markdown.ts) müsste
Mentions parsen/sanitizen; optional mentioned-User als Beobachter hinzufügen
(MT-Verhalten) oder späteres Notification-Konzept. Editor-seitig reicht v1:
Popover-Autocomplete im Textarea (Trigger `@`, Filter wie assign-button.tsx).

## OFFEN 3: MT-Aktivitätshistorie („Phuong erstellte die Aufgabe")
Unser Log erfasst nur, was in UNSERER App passiert; `item_added` gibt es seit
heute. Für importierte MT-Karten fehlt die Historie, weil der MT-Import keine
Activity geschrieben hat und MTs eigener Verlauf nicht exportiert wurde.
Optionen: (a) Import-Nachtrag: synthetische `created`-Activity je Karte aus dem
MT-Dump (created_by/created_at stehen in mt-*.json? prüfen); (b) MT-GraphQL
`workflow` / events erneut ziehen (Browser-Session-Weg, siehe Memory
`meistertask-import`). Erst klären, ob dem User (a) reicht.

## OFFEN 3b: Fälligkeits-Feld als shadcn Date Picker (User-Wunsch)
Das native `<input type="date">` (tt.mm.jjjj) in der Karten-Sidebar
(card-modal.tsx §SidebarField „Fälligkeit") durch das shadcn-Date-Picker-Muster
ersetzen: Button mit formatiertem Datum (de-AT, z. B. „14. Juli 2026") +
Popover mit `components/ui/calendar` (react-day-picker v9 ist installiert;
NICHT auf v10 bumpen, siehe Memory audit-remediation-plan). Mit „Entfernen"-
Aktion für due=null. Gleiches Muster ggf. auch im Quick-Create-Dialog.

## OFFEN 4 (aus dem Bug-Hunt-Review, bewusst NICHT gefixt — Cleanup-Backlog)
Nur Wartbarkeit, keine Bugs; bei Gelegenheit:
- AuthScreen: doppelte Fehler/Shake-Logik (login vs. gate) → useShakeError-Hook;
  Hell-Palette als ~15 Hex-Literale statt Token-Scope (.auth-light mit CSS-Vars).
- 4. Kompakt-Zahlenformatierer (formatK in dashboard-client) vs. Intl-compact in
  post-card/social-dashboard/references-section → nach lib/shared extrahieren.
- AvatarStack-Komponente extrahieren (card-chip Beobachter + celebration Banner).
- cardRankBetween/columnRankBetween generisch zusammenführen (rank-util).
- Social-Pool-Aufbau (Backfill via post_ids) dupliziert in social/page.tsx und
  social/dashboard.ts → loadThemePool()-Helper.
- assign-button: byId-Prop droppen (aus members ableitbar).
- onDragEnd: Index-Buchhaltung auf dnd-kit `sortable`-Eventdaten umstellen.
- Social-Dashboard: schmale Select statt voller Post-Rows (Cache mildert das).
- AKZEPTIERTES RISIKO (dokumentieren, nicht fixen ohne User): /api/auth/login ist
  gate-öffentlich (bewusst, Ein-Schritt-Login); Schutz = Rate-Limit 5/min/IP
  (in-memory, pro Instanz). Bei Bedarf härter: Turnstile o. Ä.

## OFFEN 5 (ältere Punkte aus früheren Sessions)
- Board Canvas-Sync (Memory board-visual-depth), YOUTUBE_CHANNEL_ID-Env in
  Vercel/Coolify, MT-Import nach Prod + Phase 5 MeisterTask-Ablösung
  (docs/BOARD_PLAN.md), Board-Mitgliedschaften pro Board falls die
  Team-Leisten-Trennung nach Vorkommen nicht reicht.

## Arbeits-Gotchas (heute gelernt)
- **Coolify baut `chore/coolify-dockerfile`**, nicht main. Tunnel: `ssh -fNL
  8088:127.0.0.1:8000 metaspots` (stirbt bei pkill-Aufräumern gern mit!).
- **Playwright-Verify:** Login über die API (`ctx.request.post /api/auth/login`)
  + `addInitScript(sessionStorage storyscout-auth-marker=1)`, NICHT den
  Klick-Flow — seit der persönliche Login voll navigiert, unterbricht ein
  goto() die laufende Navigation und lässt Next-Streams „geparkt" zurück
  (Symptom: Inhalt als body-Kind statt in <main>, Screenshots hängen).
- Lokaler Test-User authtest.tmp@oeaw.ac.at / tmp-test-9911 (public.users
  disabled_at gesetzt — vor Tests auf NULL, danach wieder disablen);
  card_activity ist append-only → User nicht löschbar.
- Für in-Browser-Tests eigenen `npm start`-Build auf :3005 fahren; der
  User-Dev-Server auf :3000 gehört dem User.
