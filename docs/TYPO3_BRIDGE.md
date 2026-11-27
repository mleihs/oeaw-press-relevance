# TYPO3-Bridge

Schnittstelle des PR-Tools für die Chrome-Extension „ÖAW TYPO3 Toolkit“
(Event-Assistent, ab 1.7.0). Die Redakteurin legt im ÖAW-TYPO3 einen
News-Datensatz an, das Panel zeigt die anstehenden Events aus `events`, holt
hier einen Claude-Entwurf und füllt das Formular feldweise. Gespeichert wird
nur in TYPO3, von Hand. In `events` schreibt die Bridge nie.

**Vertrag (verbindlich):** `typo3-browser-extension/docs/typo3-bridge-contract.md`
(Repo `mleihs/typo3-browser-extension`). Kurzfassung:

| Route | Zweck |
|---|---|
| `GET /api/typo3-bridge/events?q=&include=all` | anstehende Events, ohne Skip (außer `include=all`) |
| `GET /api/typo3-bridge/events/:id` | ein Event mit `bodytext` und `event_information` |
| `GET /api/typo3-bridge/events/:id/draft` | gespeicherter Entwurf, **nie** Claude; 404, solange keiner da ist |
| `POST /api/typo3-bridge/events/:id/draft` | `{ refresh?, instructions? }` → Claude-Entwurf, gespeichert |

Fehler: `{ "error": "<deutscher Satz>" }`, den das Panel so anzeigt.

## Betrieb

- **Env `TYPO3_BRIDGE_TOKEN`** (≥ 32 Zeichen, `openssl rand -hex 32`): ein
  gemeinsames Bearer-Token. Fehlt es, sind alle Routen aus (503) und berühren
  die DB nicht. Sperren = Token tauschen und neu deployen. Wer es bekommt und
  wann es getauscht wird, regelt „Token-Politik“ unten.
- **Env `ANTHROPIC_API_KEY`**: nur für POST …/draft. Fehlt er, antwortet nur
  der neue Entwurf mit 503; Liste, Detail und gespeicherte Entwürfe gehen.
  Auf der Box (Coolify) gesetzt, auf Vercel nicht.
- **Migration** `supabase/migrations/20261127000001_event_typo3_drafts.sql`
  (Tabelle `event_typo3_drafts`, ein Entwurf je Event, mit Tokens und Kosten).
  Muss **vor** dem ersten Deploy mit Token laufen: die Liste fragt per
  `EXISTS` nach Entwürfen und gäbe sonst 500.
- **Gate:** `/api/typo3-bridge/` steht in `PUBLIC_PREFIXES`
  (`lib/shared/gate.ts`); das Token ist die Grenze. 5 Fehlversuche je IP in
  15 Minuten → 429, das richtige Token kommt immer durch.
- **Laufzeit:** Opus 5.5, Effort `high`, ein Wiederholversuch, 240 s Timeout.
  Vor der Box trennt Cloudflare nach rund 100 s (524); der Entwurf wird dann
  trotzdem fertig und gespeichert, das Panel lädt ihn beim nächsten Öffnen.
- **Kosten** je Entwurf: `event_typo3_drafts.cost_usd` (Live-Preise über
  `estimateCost`).

## Token-Politik (Entscheidung 2026-11-27)

- Die Bridge hat **ein** gemeinsames `TYPO3_BRIDGE_TOKEN`, so wie das PR-Tool
  ein gemeinsames Gate-Passwort hat (`GATE_TOKEN`, `lib/server/gate.ts`).
- Das Token bekommen dieselben Personen wie das Gate-Passwort, nicht mehr und
  nicht weniger.
- Verlässt jemand das Team, werden Gate-Passwort und Token **gemeinsam**
  getauscht: neue Werte in Coolify setzen, neu deployen, das Token im Panel
  der Extension neu eintragen.

**Merkposten: persönliche Tokens.** Sobald das gemeinsame Gate-Passwort
abgelöst wird und alle mit persönlichem Login arbeiten, stellt auch die Bridge
auf persönliche Tokens um.
- Ein Token je Person.
- Der Name der Person steht in den Kosten-Logs (`typo3_bridge_*`).
- Ein Zugang lässt sich einzeln sperren, ohne die anderen zu tauschen.
- Die Extension bleibt gleich; jede Person trägt ihr eigenes Token im Panel ein.

Persönliche Konten gibt es schon: Supabase Auth mit `public.users`, Rolle und
`disabled_at` (`lib/server/auth/require.ts`, `docs/BOARD_PLAN.md` §3.1). Sie
liefern bisher nur die Identität fürs Board; das Gate bleibt davor. Naheliegend
ist deshalb, das Token an die `users`-Zeile zu hängen (nur ein Hash wird
gespeichert, `disabled_at` sperrt mit). Hinweise auf diesen Merkposten stehen
in `lib/server/gate.ts`, `lib/server/auth/require.ts` und
`lib/server/typo3-bridge/http.ts`; suchen nach `MERKPOSTEN TYPO3-Bridge`.

## Panel verbinden

Extension → Event-Assistent → Zahnrad: Adresse
`https://oeaw-press-tool.metaspots.net` und das Token. Chrome fragt einmal nach
Zugriff auf genau diesen Host.

## Code

```
app/api/typo3-bridge/events/…        Routen (dünn)
lib/server/typo3-bridge/
  http.ts          Bearer-Guard, CORS auf jeder Antwort, Routen-Rahmen
  contract.ts      Antwort-Typen des Vertrags
  events.ts        Liste/Detail (Filter, has_bodytext, has_draft)
  draft-prompt.ts  Systemprompt, Ausgabe-Schema, Nutzernachricht
  draft.ts         Claude-Aufruf, HTML-Bereinigung, Nachbearbeitung
  draft-store.ts   event_typo3_drafts lesen/schreiben
  draft-service.ts wann gespeichert, wann neu geschrieben wird
  errors.ts        Claude-Fehler → HTTP (nie 401/403, 503 nur ohne Key)
lib/server/bearer-auth.ts            gemeinsamer Bearer-Guard (auch Nacht-Cron)
```

Tests: `npx vitest run lib/server/typo3-bridge app/api/typo3-bridge`
(Claude gemockt, keine DB). Die Extension hat eigene End-to-End-Tests gegen
Nachbauten (`tests/event-assistant/run.mjs` dort).
