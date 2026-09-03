# Resume: /social nach Claude-Design neu bauen (mobil + desktop + neues Aktualisierungsmodell)

> **ERLEDIGT am 2026-07-06 — historisches Dokument, NICHT erneut ausführen.**
> Das /social-Redesign ist shipped und verifiziert (Memory
> `social-redesign-shipped`); der Settings-Audit folgte am 2026-07-21
> (Memory `social-feature-landed`).

**Stand:** erledigt (shipped 2026-07-06). Diese Datei war das Resume nach
Context-Clear und bleibt nur als Protokoll.

## Aufgabe
Die Social-Media-Seite `/social` gemäß Claude-Design neu bauen: **Mobile + Desktop**
und das **neu gestaltete Aktualisierungs-(Refresh-)Modell** übernehmen.

**Design:** https://claude.ai/design/p/7e47982d-6cf6-4220-b07c-bfb3ca491569?file=Toolkit-Redesign.dc.html
- claude.ai-auth-gated → `WebFetch` gibt 403. Über **Claude-in-Chrome** im eingeloggten
  Browser öffnen (User navigiert ggf. hin). Das Design rendert clientseitig in einem
  **cross-origin iframe** von `*.claudeusercontent.com` via `_bootstrap`-Loader — es ist
  NICHT per direkter Datei-URL abrufbar (`/Toolkit-Redesign.dc.html` → 404, `_bootstrap`
  = leerer JS-Loader). Extraktionsweg: den **gerenderten Viewer-Tab** per Screenshot /
  `read_page` lesen, oder den User bitten, den Social-Media-Ausschnitt (HTML/CSS) zu
  exportieren/pasten. Suchbegriffe im Design: „Social", „Aktualisier"/„refresh".

## Umzubauende Dateien (bestehende /social-Struktur)
- `app/social/page.tsx`, `app/social/loading.tsx`
- `app/social/_components/`: `social-dashboard.tsx`, `social-views.tsx`, `social-toolbar.tsx`,
  `stat-strip.tsx`, `post-card.tsx`, `post-image.tsx`, `image-quickview.tsx`, `briefing.tsx`,
  `cost-summary.tsx`, `theme-chips.tsx`, `top-tags.tsx`, `accordion-list.tsx`,
  `social-filter-context.tsx`, **`refresh-button.tsx`** (= aktuelles Aktualisierungsmodell)
- API: `app/api/social/{refresh,settings,channels,image}/route.ts`
- **„Aktualisierungsmodell"** = der Refresh-Flow (APIFY-getriggert):
  `refresh-button.tsx` + `app/api/social/refresh/route.ts` + `cost-summary.tsx`.

Vorgehen: `/social` live ansehen, Design studieren, mobile+desktop nachbauen inkl. neuem
Refresh-Modell → `npx tsc --noEmit`, `eslint`, `npm test`, `npm run build` grün → committen + deployen.

## Kritischer Infra-Kontext (diese Session, 2026-07-06)
- Cloud-Supabase `duqybyxpgghietjbrxnc` **egress-gesperrt (402)**. Ersatz: **self-hosted
  Supabase auf dem metaspots-VPS via Coolify**, live. SSOT: `~/Dev/metaspots-infra/
  SYSTEM-STATE-AND-RUNBOOK.md §4.4`. Memory-Datei: `selfhosted-supabase-oeaw`.
- **Beide Deployments** laufen gegen die self-hosted Supabase:
  Vercel `oeaw-press-relevance.vercel.app` + Coolify `oeaw-press-tool.metaspots.net`.
  API `https://supabase.metaspots.net`, DB-Pooler `db-oeaw.metaspots.net:5432` (sslmode=require).
- **Admin-Login:** `matthias.leihs@oeaw.ac.at` / `<redacted>` (⚠️ das gmail-Konto wurde
  gelöscht!). `stefan.meisterle@oeaw.ac.at` / `<redacted>`. **Gate-Passwort:** `<redacted>`.
- **Deploy-Workflow:**
  - `main` committen+pushen → **Vercel** deployt automatisch (Git-Integration).
  - **Coolify** trackt Branch `chore/coolify-dockerfile` (Dockerfile-Overlay über main):
    `git checkout chore/coolify-dockerfile && git merge main && git push origin chore/coolify-dockerfile && git checkout main`,
    dann Redeploy:
    ```
    ssh -fNL 8000:127.0.0.1:8000 metaspots   # tunnel (falls unten)
    TOKEN=$(cat ~/.config/metaspots/coolify-api.token)
    curl -s "http://127.0.0.1:8000/api/v1/deploy?uuid=cbt2tdcwf10ia0prqk8r45bm&force=false" -H "Authorization: Bearer $TOKEN"
    ```
- **Live-Verify (gate→login), pro Deployment:**
  ```
  BASE=https://oeaw-press-tool.metaspots.net   # oder https://oeaw-press-relevance.vercel.app
  curl -sS -c /tmp/cj -X POST "$BASE/api/auth/gate"  -H 'Content-Type: application/json' -H "Origin: $BASE" -H "Referer: $BASE/" --data '{"password":"<redacted>"}'
  curl -sS -b /tmp/cj -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "Origin: $BASE" -H "Referer: $BASE/" --data '{"email":"matthias.leihs@oeaw.ac.at","password":"<redacted>"}'
  ```
- Erledigt in dieser Session (nicht erneut anfassen): self-hosted-Supabase-Aufbau + 1:1-
  Datenmigration, Board-Daten-Push (9 Boards/292 Karten), User-Konsolidierung (12 User,
  gmail+3 Dev-Dummies gelöscht), Admin-Nutzer-Switcher auf Prod, Haiku-vor-WebDB,
  Triage-unter-„Mehr". Alles committed (main `90e5f67`/`9288316`/`cd1c196`) + deployed.
