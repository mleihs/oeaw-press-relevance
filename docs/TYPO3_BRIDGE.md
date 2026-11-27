# TYPO3-Bridge

Schnittstelle des PR-Tools für die Chrome-Extension „ÖAW TYPO3 Toolkit“
(Event-Assistent, ab 1.7.0; News-Wizard, Vertrag v2). Die Redakteurin legt im
ÖAW-TYPO3 einen News-Datensatz an, das Panel zeigt die anstehenden Events aus
`events`, holt hier einen Claude-Entwurf und füllt das Formular feldweise. Der
News-Wizard holt für einen selbst geschriebenen Beitrag Vorschläge für Titel,
Dachzeilen, Teaser, SEO-Felder sowie Alt-Text und Bildunterschrift. Gespeichert
wird nur in TYPO3, von Hand. In `events` schreibt die Bridge nie.

**Vertrag (verbindlich):** `typo3-browser-extension/docs/typo3-bridge-contract.md`
(Repo `mleihs/typo3-browser-extension`). Kurzfassung:

| Route | Zweck |
|---|---|
| `GET /api/typo3-bridge/events?q=&include=all` | anstehende Events, ohne Skip (außer `include=all`) |
| `GET /api/typo3-bridge/events/:id` | ein Event mit `bodytext` und `event_information` |
| `GET /api/typo3-bridge/events/:id/draft` | gespeicherter Entwurf, **nie** Claude; 404, solange keiner da ist |
| `POST /api/typo3-bridge/events/:id/draft` | `{ refresh?, instructions? }` → Claude-Entwurf, gespeichert |
| `POST /api/typo3-bridge/news/assist` | News-Wizard: `task` `texts` (≥ 200 Zeichen Text) oder `image` (Zuschnitt als base64, ≤ 1,5 MB, sonst 413); zustandslos, jede Anfrage ist ein Claude-Aufruf |

Fehler: `{ "error": "<deutscher Satz>" }`, den das Panel so anzeigt.

## Betrieb

- **Env `TYPO3_BRIDGE_TOKEN`** (≥ 32 Zeichen, `openssl rand -hex 32`): ein
  gemeinsames Bearer-Token. Fehlt es, sind alle Routen aus (503) und berühren
  die DB nicht. Sperren = Token tauschen und neu deployen.
- **Env `ANTHROPIC_API_KEY`**: nur für POST …/draft und POST …/news/assist.
  Fehlt er, antworten nur diese mit 503; Liste, Detail und gespeicherte
  Entwürfe gehen.
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
- **News-Wizard:** Opus 5.5, Effort `high` (texts) bzw. `medium` (image),
  kein Wiederholversuch, Timeout 85 s bzw. 55 s (das Panel wartet 90 s bzw.
  60 s). Harte Längengrenzen (Titel 100, Dachzeilen 30, Teaser 250, SEO 160,
  alternativer Titel 60, Alt-Text 150, Bildunterschrift 200) prüft der Code
  nach; darüber wird gekürzt, und `notes` sagt es. Nichts wird gespeichert.
- **Kosten** je Entwurf: `event_typo3_drafts.cost_usd` (Live-Preise über
  `estimateCost`). Der News-Wizard speichert nichts; Tokens und Kosten stehen
  je Aufruf im Log (`typo3_bridge_news_assist`).

## Panel verbinden

Extension → Event-Assistent → Zahnrad: Adresse
`https://oeaw-press-tool.metaspots.net` und das Token. Chrome fragt einmal nach
Zugriff auf genau diesen Host.

## Code

```
app/api/typo3-bridge/events/…        Routen (dünn)
app/api/typo3-bridge/news/assist/    News-Wizard: Eingangsprüfung (400/413), Aufruf, Log
lib/server/typo3-bridge/
  http.ts          Bearer-Guard, CORS auf jeder Antwort, Routen-Rahmen
  contract.ts      Antwort-Typen des Vertrags
  events.ts        Liste/Detail (Filter, has_bodytext, has_draft)
  draft-prompt.ts  Systemprompt, Ausgabe-Schema, Nutzernachricht
  draft.ts         Claude-Aufruf, HTML-Bereinigung, Nachbearbeitung
  draft-store.ts   event_typo3_drafts lesen/schreiben
  draft-service.ts wann gespeichert, wann neu geschrieben wird
  news-assist-prompt.ts  News-Wizard: Anfrage-Schema, Grenzen, Prompts, Schemas
  news-assist.ts         News-Wizard: Claude-Aufruf (Text bzw. Bild-Block), Kürzen, Hinweise
  errors.ts        Claude-Fehler → HTTP (nie 401/403, 503 nur ohne Key)
lib/server/bearer-auth.ts            gemeinsamer Bearer-Guard (auch Nacht-Cron)
```

Tests: `npx vitest run lib/server/typo3-bridge app/api/typo3-bridge`
(Claude gemockt, keine DB). Die Extension hat eigene End-to-End-Tests gegen
Nachbauten (`tests/event-assistant/run.mjs` dort).
