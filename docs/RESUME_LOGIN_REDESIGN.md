# Resume: Login-/Gate-Redesign + Umbenennung „ÖAW Presse" + Board-Folgearbeiten

**Stand:** 2026-07-06, nach dem /social-Redesign-Deploy. Diese Datei = Einstieg nach Context-Clear.

> **UPDATE (später am 2026-07-06):** Aufgaben 1 + 2 sind ERLEDIGT und deployed.
> Design-Quelle liegt unter `docs/design/claude-design/Login.dc.html`. Umsetzung:
> `components/auth/auth-screen.tsx` (gemeinsamer Screen, variant gate|login),
> Gate = AuthScreen mit Übergangszugang-Box; /api/auth/login ist gate-öffentlich
> und setzt bei Erfolg das Gate-Cookie mit (lib/server/gate.ts GATE_COOKIE_OPTIONS).
> Passwort-vergessen = mailto-Flow (kein Self-Service, wie gehabt). Demo-Zugänge-
> Kasten bewusst NICHT übernommen (User-Wunsch). Umbenennung „ÖAW Presse" überall
> inkl. Nav-Logo (Phosphor RadioButton fill) + Favicon app/icon.svg.
> Offen bleibt nur Aufgabe 3 (Board-Rakete + Zuweisen, Design-Prompt beim User).

## Offene Aufgaben (Reihenfolge empfohlen)

### 1. Login-/Gate-/Passwort-Screens nach neuem Claude-Design — DONE
Claude Design hat neue Designs für den Login-Schirm (ersetzt die Capybara-Gate-Seite),
Passwort-vergessen-Screens usw. gebaut — **im Design-Projekt nachsehen und umsetzen**.

- Design-Projekt: https://claude.ai/design/p/7e47982d-6cf6-4220-b07c-bfb3ca491569
- **Extraktionsweg (funktioniert, kein Screenshot-Gefrickel):** Im eingeloggten Chrome
  einen Tab auf dem Design-Projekt öffnen, dann per `javascript_tool` die interne API:
  `POST /design/anthropic.omelette.api.v1alpha.OmeletteService/ListFiles`
  mit `{"projectId":"7e47982d-6cf6-4220-b07c-bfb3ca491569"}` → Dateiliste;
  `GetFile` mit `{"projectId":…,"path":"<Datei>.dc.html"}` → `content` ist Base64.
  Transfer nach lokal: im Tab dekodieren + `navigator.clipboard.writeText` (vorher
  einen echten Klick auf die Seite für Fokus!), lokal `pbpaste > datei`.
  Bereits extrahiert liegen `Toolkit-Redesign.dc.html` + `Board-Mobile.dc.html`
  unter `docs/design/claude-design/` (committed).
  Die Login-Screens sind NEUER — Datei(en) erneut per ListFiles suchen (Login/Gate).
- Betroffener Code: `components/password-gate.tsx` (Gate-Overlay, sessionStorage-Marker
  `storyscout-auth-marker`), `app/login/page.tsx`, ggf. Mailtext/„Admin kontaktieren"
  (mailto, bewusst kein Self-Service-Reset — Memory `login-page-forgot-password-links`).

### 2. Umbenennung „Science Propaganda Ninja" → „ÖAW Presse" — DONE
Wie im neuen Login-Screen-Design, mit demselben Logo (Radio-Button-Icon wie im
Toolkit-Redesign-Header „ÖAW Presse"). Überall spiegeln: Top-Nav-Marke nach Login,
`<title>`/Metadata, Footer („Science Propaganda Ninja 0.1"), Gate-Seite
(„SCIENCE PROPAGANDA NINJA · ÖAW"), Release-Seite-Header ggf. Hinweis.
`grep -rn "Science Propaganda Ninja\|Propaganda" app components lib public`.

### 3. Board: Raketen-Celebration + prominenter „Zuweisen"-Button
Der Design-Prompt wurde dem User geliefert (er postet ihn ins Design-Projekt).
Sobald das Design da ist: wie /social extrahieren + umsetzen.
- MeisterTask-Referenz: beim Abschließen fliegt eine Emoji-Rakete 🚀 diagonal
  rechts-unten→oben, Kopf wird grün („Abgeschlossen von …"), Banner „Benötigte
  Zeit + N Personen trugen bei" mit Avataren. „Zuweisen" = eigener Button mit
  Avatar-Icon ganz oben in der Modal-Leiste.
- Bei uns: Assignee existiert als Select im Karten-Modal (`card-modal.tsx:945`,
  `patchCardApi(card.id, { assignee_id })`) — nur unprominent. Avatare sind jetzt
  echte Bilder (siehe unten), der Zuweisen-Picker kann sie nutzen.
- Board-Microanimations generell: Karten-Hover-Lift existiert (`.board-card` in
  globals.css); die Celebration ist der eigentliche fehlende Belohnungsmoment.
- User-Testkarte https://www.meistertask.com/app/task/cOtjdxeU/test wurde von uns
  „abgeschlossen" (für die Raketen-Demo) — auf Wunsch zurücksetzen.

## In dieser Session erledigt (nicht erneut anfassen)
- **/social komplett nach Claude-Design neu gebaut** (Desktop + Mobile + neues
  Refresh-Modell mit Stepper; mobil Bottom-Sheet via vaul; Microanimations
  reduced-motion-gated). Commits `d83a293` (+ Follow-ups) auf main.
- **MeisterTask-Avatare**: `users.avatar_key` (Migration 20260706000001, lokal +
  prod appliziert), MinIO `avatars/<user_id>.<ext>` (Bucket beider Deployments),
  Proxy `/api/users/[id]/avatar`, `BoardAvatar` rendert Bilder mit Initialen-
  Fallback. Import-Script `scripts/import-meistertask-avatars.mjs` (Eingabe
  mt-persons.json aus MT-GraphQL `{ persons { id email firstname lastname
  avatar_thumb } }` via `/app/api/graphql?q=X` im eingeloggten Chrome).
  10/12 User haben Bilder (matthias.leihs + renate.teufel ohne).
- **Release-Seite** `/release/redaktionstoolkit.html`: neue Sektion „07 · Social
  Media" mit echten Vorher/Nachher-Playwright-Screenshots (`public/release/img/`),
  Folgesektionen umnummeriert, Timeline ergänzt.
- Deployed auf Vercel (main-Push) + Coolify (chore/coolify-dockerfile-Merge +
  API-Redeploy). Live-Verify siehe unten.

## Arbeits-Gotchas dieser Session
- **Screenshots beider Stände lokal statt Prod-Gefummel:** alter Stand als
  `git worktree add ../oeaw-vorher <commit>` + `cp -cR node_modules …` (APFS-Clone;
  Symlink bricht Turbopack: „points out of filesystem root"), `PORT=3001 npm run dev`,
  dann Playwright (im Repo vorhanden!) headless — Script-Muster siehe Git-History
  des Release-Commits (`capture-social.tmp.mjs`, aus Repo-Root laufen lassen wegen
  Modulauflösung). Dev-Modus bypassed das Gate, /social rendert ohne Session.
  Worktree hinterher: `git worktree remove ../oeaw-vorher --force`.
- **Prod-DB direkt:** `DATABASE_URL` aus `~/.config/metaspots/oeaw-app-selfhosted-supabase.env`,
  node-pg mit `?sslmode=no-verify` (selbstsigniertes Zertifikat am Pooler).
- **Coolify-Tunnel:** lokal **8088**→VPS:8000 (`ssh -fNL 8088:127.0.0.1:8000 metaspots`),
  Token `~/.config/metaspots/coolify-api.token`, Deploy-UUID `cbt2tdcwf10ia0prqk8r45bm`.
- **Gate im eigenen Browser-Tab:** Cookie `gate` (30 Tage) + pro Tab
  `sessionStorage['storyscout-auth-marker']='1'` + Event `storyscout-auth-success`.
- MCP-Tab-Gruppen wurden mehrfach vom User geschlossen — Tabs nie horten, Zustand
  immer frisch via `tabs_context_mcp` prüfen.

## Live-Verify (gate→login), pro Deployment
```
BASE=https://oeaw-press-tool.metaspots.net   # oder https://oeaw-press-relevance.vercel.app
curl -sS -c /tmp/cj -X POST "$BASE/api/auth/gate"  -H 'Content-Type: application/json' -H "Origin: $BASE" -H "Referer: $BASE/" --data '{"password":"movefastandbreakthings"}'
curl -sS -b /tmp/cj -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "Origin: $BASE" -H "Referer: $BASE/" --data '{"email":"matthias.leihs@oeaw.ac.at","password":"TESTIT12"}'
```
(matthias.leihs@oeaw.ac.at / TESTIT12 — das gmail-Konto existiert nicht mehr.)
