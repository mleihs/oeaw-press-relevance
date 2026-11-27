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

- **Env `TYPO3_BRIDGE_TOKEN`** (≥ 32 Zeichen, `openssl rand -hex 32`): das
  gemeinsame Bearer-Token, im Log `gemeinsam`.
- **Env `TYPO3_BRIDGE_TOKENS`**: benannte Tokens, einzeln sperrbar, als
  `name:token`-Paare, getrennt durch Komma oder Zeilenumbruch
  (`extern-1:<64 hex>,extern-2:<64 hex>`). Namen aus `a–z`, `0–9`, `-`,
  höchstens 40 Zeichen; Tokens ≥ 32 Zeichen, kein Name und kein Token doppelt,
  auch nicht gegenüber dem gemeinsamen. Formfehler halten den Server beim
  Booten an (`lib/server/env.ts`); die Meldung nennt nie ein Token.
- Ist keins der beiden gesetzt, sind alle Routen aus (503) und berühren die DB
  nicht. Jede angenommene Anfrage steht mit dem Namen ihres Tokens im Log
  (`typo3_bridge_request`: `token`, `method`, `path`), der News-Wizard
  zusätzlich in `typo3_bridge_news_assist`. Wer welches Token bekommt und wie
  gesperrt wird, regelt „Token-Politik“ unten.
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

## Token-Politik (Entscheidungen 2026-11-27)

**Gemeinsames Token.**
- `TYPO3_BRIDGE_TOKEN` ist das gemeinsame Token, so wie das PR-Tool ein
  gemeinsames Gate-Passwort hat (`GATE_TOKEN`, `lib/server/gate.ts`).
- Es bekommen dieselben Personen wie das Gate-Passwort, nicht mehr und nicht
  weniger.
- Verlässt jemand das Team, werden Gate-Passwort und gemeinsames Token
  **gemeinsam** getauscht: neue Werte in Coolify setzen, neu deployen, das
  Token im Panel der Extension neu eintragen.

**Benannte Tokens für Weitergaben** (nachmittags, zur Weitergabe der
Extension 1.11.2).
- Wer die Extension außerhalb dieses Kreises bekommt, bekommt ein eigenes
  benanntes Token aus `TYPO3_BRIDGE_TOKENS`, nie das gemeinsame.
- Seit 27.11.: `extern-1` und `extern-2`. Die Namen sind bewusst neutral; wer
  welches hat, steht nicht im Repo.
- Die Tokens liegen auf dem Mac des Betreibers unter
  `~/.config/oeaw-press-release/typo3-bridge-token-<name>` (chmod 600) und
  stehen in keinem Chat und keinem Commit.
- **Sperren:** den Eintrag aus `TYPO3_BRIDGE_TOKENS` in Coolify nehmen und neu
  deployen. Die anderen Tokens bleiben gültig, auch das gemeinsame.
- **Neues Token:** `openssl rand -hex 32`, als `name:token` anhängen, neu
  deployen.
- Ein Tausch des Gate-Passworts berührt die benannten Tokens nicht.

**Merkposten: persönliche Tokens.** Sobald das gemeinsame Gate-Passwort
abgelöst wird und alle mit persönlichem Login arbeiten, stellt auch die Bridge
auf persönliche Tokens um.
- Ein Token je Person.
- Der Name der Person steht in den Logs (`typo3_bridge_*`); das geht heute
  schon für die benannten Tokens.
- Sperren ohne Redeploy (heute: Env-Eintrag entfernen und neu deployen).
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
app/api/typo3-bridge/news/assist/    News-Wizard: Eingangsprüfung (400/413), Aufruf, Log
lib/server/typo3-bridge/
  http.ts          Bearer-Guard, Token-Name je Anfrage (Log), CORS, Routen-Rahmen
  tokens.ts        gemeinsames + benannte Tokens aus der Env lesen und prüfen
  contract.ts      Antwort-Typen des Vertrags
  events.ts        Liste/Detail (Filter, has_bodytext, has_draft)
  draft-prompt.ts  Systemprompt, Ausgabe-Schema, Nutzernachricht
  draft.ts         Claude-Aufruf, HTML-Bereinigung, Nachbearbeitung
  draft-store.ts   event_typo3_drafts lesen/schreiben
  draft-service.ts wann gespeichert, wann neu geschrieben wird
  news-assist-prompt.ts  News-Wizard: Anfrage-Schema, Grenzen, Prompts, Schemas
  news-assist.ts         News-Wizard: Claude-Aufruf (Text bzw. Bild-Block), Kürzen, Hinweise
  errors.ts        Claude-Fehler → HTTP (nie 401/403, 503 nur ohne Key)
  fixtures/        wwwt1-Export 27.11. (3 GMI-Events, nur Eckdaten) für Tests
lib/server/events/eckdaten.ts        Eckdaten statt Fließtext (VBC-Institute)
lib/server/bearer-auth.ts            gemeinsamer Bearer-Guard (auch Nacht-Cron), ein oder mehrere benannte Secrets
```

**Eckdaten statt Fließtext.** Bei GMI, IMBA, IMP und Max Perutz Labs ist der
bodytext oft nur eine Zeile `Date: …, Time: …, Speaker: …, Location: …, Type: …,
Institute: …, Host: …` (Stand 27.11.: 123 Events in Prod). Der Entwurf gibt sie
Claude als eigenen Block `<eckdaten>`, bereinigt (doppelte Kommas, „None",
Sekunden, mehrere Vortragende mit `<br />`). Der Prompt sagt, wie die Angaben zu
lesen sind, und verbietet Inhalt über den Titel hinaus. Bei einem
Platzhaltertitel („Title to be announced") entsteht der Titel aus Reihe und
Person, und die Hinweise melden fehlenden Titel und Abstract. Musterfall sind
die drei GMI-Events aus `fixtures/` (wwwt1-uids, in Prod nicht vorhanden).

**Veranstalter = vortragende Person.** Bei GMI steht im TYPO3-Feld
Veranstalter fast immer die vortragende Person (Prod 27.11.: 120 von 123
Eckdaten-Events, die übrigen 3 ohne Veranstalter). `organizerIsSpeaker`
(`lib/server/events/eckdaten.ts`) erkennt das, auch bei mehreren Personen mit
`<br>` und bei Komma am Ende. Der Entwurf bekommt den Veranstalter dann leer, und
`organizer` kommt nach der bestehenden Regel aus dem Institut. GMI-Events ganz
ohne Text (Prod 27.11.: 94, davon 53 künftig) lassen sich nicht vergleichen;
dort gilt die Hauskonvention: die Person geht als eigene Angabe „Vortragende
Person (TYPO3-Feld Veranstalter)" hinein, Claude setzt sie als `speaker`, und
die Hinweise nennen die Herkunft (`readOrganizer` in `draft-prompt.ts`, Liste
`ORGANIZER_FIELD_HOLDS_SPEAKER`). Andere Institute bleiben unverändert.

Tests: `npx vitest run lib/server/typo3-bridge app/api/typo3-bridge`
(Claude gemockt, keine DB). Die Extension hat eigene End-to-End-Tests gegen
Nachbauten (`tests/event-assistant/run.mjs` dort).
