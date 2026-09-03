// Kein `import 'server-only'`: dieser Runner wird auch vom CLI-Wrapper
// scripts/import-events-json.ts (tsx) importiert; das server-only-Guard würde
// dort werfen. Server-only ist über boundaries-Lint + DB-Zugriff gesichert.
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db, ingestRuns } from '@/lib/server/db';
import { upsertEvents } from '@/lib/server/events/sync';
import { fetchJsonExport } from './fetch-export';
import { parseEventNewsGrouped } from './adapters/typo3-events-json';

// Wiederverwendbarer Runner für den TYPO3-Events-JSON-Export (event_news_grouped,
// Redmine #4165). Extrahiert aus scripts/import-events-json.ts, damit CLI-Wrapper
// und die unbeaufsichtigte Route POST /api/ingest/run denselben Pfad fahren.
//
// NEU ggü. dem Script: ein ingest_runs-Journal für diesen Feed (bisher schreibt
// NUR der Publications-Delta-Importer das Journal). Anders als beim Publications-
// Pfad (eine atomare PG-Funktion apply_publications_delta) folgen Events ADR-0019
// (Single-Table → DB-Write in der Feature-Schicht via Drizzle upsertEvents, keine
// PG-Funktion). Damit „was atomar sein muss, auch atomar ist", laufen Skip-Check +
// Upsert + Journal-Schreiben hier in EINER db.transaction; die Idempotenz stützt
// sich zusätzlich auf die UNIQUE(feed, generated_at_timestamp)-Constraint.
//
// Broken-Feed-Guard (Redmine #4165, Feed war 2026-06-26 upstream leer): ein Lauf
// ohne verwertbare Events wird klassifiziert, NICHT pauschal als Defekt gewertet
// — siehe classifyEmptyFeed(). Der Export trägt real nur 1–2 Events pro Tag, ein
// Tag ohne Neuzugang ist Normalbetrieb und darf die Nachtmail nicht auslösen
// (am 2026-07-20 tat er genau das: parsed===0 ⇒ 'failed' ⇒ Fehlalarm).
//
// NACHTRAG 2026-08-26: der 07-20-Fix hat den Fehlalarm NICHT beseitigt, er hat
// nur das Kriterium getauscht (parsed===0 ⇒ institutes.length===0). Für DIESEN
// Feed ist das dasselbe Kriterium: TYPO3 legt eine Institutsgruppe nur an, wenn
// sie mindestens ein Event trägt, ein Tag ohne Neuzugang liefert deshalb
// `"data": []` — strukturell nicht unterscheidbar von einem kaputten Export.
// Beleg aus 41 journalisierten Läufen: „institutes gefüllt UND parsed=0" kam
// NULL mal vor, der 'skipped'-Zweig war toter Code. 14 von 41 Nächten (34 %)
// alarmierten, montags 6 von 6 — der Montags-Export deckt das Wochenende ab, an
// dem niemand Events einpflegt. Die Unterscheidung kann nicht aus EINER Nacht
// kommen; sie kommt jetzt aus der Serie und aus dem Zeitstempel.

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json';
/** Logischer Cursor-Schlüssel in ingest_runs für diesen Feed. */
export const EVENTS_FEED = 'event_news_grouped';

export interface EventsImportRunOptions {
  /** Vorab geladene Export-JSON (z. B. aus --file). Fehlt sie, wird `url` geholt. */
  json?: unknown;
  /** Export-URL, wenn `json` nicht übergeben ist. Default: kanonischer Feed. */
  url?: string;
  /** Menschenlesbares Quell-Label fürs Journal. Default: die URL. */
  sourceLabel?: string;
  /** Parsen + normalisieren, KEIN DB-Write und KEIN Journal. */
  dryRun?: boolean;
}

export interface EventsImportResult {
  feed: string;
  status: 'applied' | 'skipped' | 'failed';
  imported: number;
  updated: number;
  /** Events, die der Adapter aus dem Feed gewonnen hat. */
  parsed: number;
  /** Adapter-Drops (kein verwertbares Startdatum). */
  droppedNoStart: number;
  /** Adapter-Drops (webdb_uid doppelt im selben Batch). */
  duplicates: number;
  institutes: string[];
  generatedAt: string | null;
  generatedAtTimestamp: number | null;
  /** Begründung für skipped/failed. */
  reason?: string;
  durationMs: number;
}

export async function runEventsImport(
  opts: EventsImportRunOptions = {},
): Promise<EventsImportResult> {
  const url = opts.url ?? DEFAULT_URL;
  const sourceLabel = opts.sourceLabel ?? url;
  const t0 = Date.now();

  const json = opts.json ?? (await fetchJsonExport(url));
  const { events, skipped, duplicates, institutes, generatedAt, generatedAtTimestamp } =
    parseEventNewsGrouped(json as Parameters<typeof parseEventNewsGrouped>[0]);

  const base = {
    feed: EVENTS_FEED,
    parsed: events.length,
    droppedNoStart: skipped,
    duplicates,
    institutes,
    generatedAt,
    generatedAtTimestamp,
    durationMs: 0,
  };
  const finish = (
    r: Omit<EventsImportResult, 'durationMs'>,
  ): EventsImportResult => ({ ...r, durationMs: Date.now() - t0 });

  // Dry-Run: nur parsen, nichts schreiben (Journal bleibt unberührt). Die
  // Serie ist von hier aus unbekannt (kein DB-Lesen), deshalb emptyStreak 0 —
  // der Stale-Test greift trotzdem, er ist reine Zeitstempel-Arithmetik und
  // fängt damit genau den Ausfall vom 2026-06-26 auch im Dry-Run.
  if (opts.dryRun) {
    const verdict =
      events.length === 0
        ? classifyEmptyFeed({
            droppedNoStart: skipped,
            generatedAtTimestamp,
            emptyStreak: 0,
            now: new Date(),
          })
        : null;
    return finish({
      ...base,
      status: verdict?.status ?? 'applied',
      imported: 0,
      updated: 0,
      reason: verdict ? `${verdict.reason} (dry-run)` : undefined,
    });
  }

  return db.transaction(async (tx) => {
    // Idempotenz: bereits angewandtes (feed, generated_at_timestamp) → Skip.
    // Nur prüfbar, wenn der Feed einen Zeitstempel trägt; die UNIQUE-Constraint
    // ist der eigentliche Race-Schutz beim Journal-Insert unten.
    if (generatedAtTimestamp != null) {
      const existing = await tx
        .select({ id: ingestRuns.id })
        .from(ingestRuns)
        .where(
          and(
            eq(ingestRuns.feed, EVENTS_FEED),
            eq(ingestRuns.generatedAtTimestamp, generatedAtTimestamp),
            eq(ingestRuns.status, 'applied'),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return finish({
          ...base,
          status: 'skipped',
          imported: 0,
          updated: 0,
          reason: 'already_applied',
        });
      }
    }

    // Kein verwertbares Event: klassifizieren statt pauschal Alarm schlagen.
    if (events.length === 0) {
      const emptyStreak = await countEmptyStreak(tx, generatedAtTimestamp);
      const verdict = classifyEmptyFeed({
        droppedNoStart: skipped,
        generatedAtTimestamp,
        emptyStreak,
        now: new Date(),
      });
      await journal(tx, {
        status: verdict.status,
        generatedAtTimestamp,
        generatedAt,
        sourceLabel,
        report: {
          reason: verdict.code,
          parsed: 0,
          dropped_no_start: skipped,
          institutes,
          // Die gezählte Serie mitschreiben: sie ist die Begründung des
          // Urteils und ohne sie im Nachhinein nicht rekonstruierbar. Seit
          // 2026-09-02 sind es ARBEITSNÄCHTE, sie kann also hinter der Zahl
          // der Kalendernächte zurückbleiben.
          empty_streak: verdict.streak,
        },
      });
      return finish({
        ...base,
        status: verdict.status,
        imported: 0,
        updated: 0,
        reason: verdict.reason,
      });
    }

    // Upsert (Drizzle, ADR-0019) + Journal — atomar in derselben Transaktion.
    const { imported, updated } = await upsertEvents(events, tx);
    await journal(tx, {
      status: 'applied',
      generatedAtTimestamp,
      generatedAt,
      sourceLabel,
      report: {
        imported,
        updated,
        parsed: events.length,
        dropped_no_start: skipped,
        duplicates,
        institutes,
      },
    });
    return finish({
      ...base,
      status: 'applied',
      imported,
      updated,
    });
  });
}

/** Ab so vielen leeren ARBEITSNÄCHTEN AM STÜCK ist „nichts Neues" kein Zufall
 *  mehr. Kalibriert an 41 Läufen seit 2026-07-16: 34 % aller Nächte sind leer,
 *  die längsten echten Leer-Serien waren 3 Tage (26.–28.07., 01.–03.08.,
 *  15.–17.08.), jeweils über ein Wochenende.
 *
 *  NACHTRAG 2026-09-02: die Schwelle blieb bei 5, gezählt werden aber nur noch
 *  Nächte, die einen Arbeitstag abdecken (siehe coversWorkday). Vorher zählten
 *  Kalendernächte, und ein Wochenende verbrauchte zwei davon gratis — effektiv
 *  waren es drei ruhige Arbeitstage bis zur Mail. Genau daran ist der Alarm vom
 *  01.09. entstanden: Fr 28.08. bis Di 01.09. ohne Neuzugang, Export durchgehend
 *  frisch (01:05–01:11), am 02.09. kamen wieder 4 Events. Nichts war defekt.
 *  Mit der Arbeitsnacht-Zählung bedeutet 5 jetzt „eine volle stille
 *  Arbeitswoche", was ein Wochenende strukturell nicht mehr erreichen kann. */
export const EMPTY_FEED_ALARM_STREAK = 5;

/** Wie viele Journal-Zeilen die Serien-Abfrage höchstens liest. Wochenend-
 *  Zeilen zählen nicht mit, verbrauchen aber einen Slot, also braucht der Scan
 *  Luft über der Schwelle: 5 Arbeitsnächte liegen im schlimmsten Fall hinter
 *  zwei Wochenenden (4 Zeilen). */
const STREAK_SCAN_LIMIT = EMPTY_FEED_ALARM_STREAK * 2 + 2;

/** Wochentag eines Unix-Zeitstempels in WIENER Zeit (0 = So … 6 = Sa).
 *  Zwingend in Wiener Zeit: der Export entsteht gegen 01:05 lokal, in UTC ist
 *  das im Sommer 23:05 des Vortags — eine UTC-Rechnung verschöbe jeden
 *  Wochentag um einen Tag und drehte die Regel genau ins Gegenteil. */
function viennaWeekday(unixSeconds: number): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    weekday: 'short',
  }).format(new Date(unixSeconds * 1000));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name] ?? 2;
}

/** Deckt dieser Export einen Tag ab, an dem überhaupt jemand Events einpflegt?
 *
 *  Der Export wird gegen 01:05 erzeugt und trägt die Änderungen des VORTAGS —
 *  dieselbe Lesart, aus der schon der Befund „montags 6 von 6 Fehlalarm" im
 *  Kopfkommentar stammt: der Montags-Export deckt den Sonntag ab. Leer ist
 *  damit strukturell erwartbar für den Sonntags-Export (Samstag) und den
 *  Montags-Export (Sonntag). Solche Nächte dürfen die Serie weder verlängern
 *  noch brechen; ohne Zeitstempel wird konservativ mitgezählt. */
export function coversWorkday(unixSeconds: number | null | undefined): boolean {
  if (unixSeconds == null || unixSeconds === 0) return true;
  const wd = viennaWeekday(unixSeconds);
  return wd !== 0 && wd !== 1;
}

/** Der Export wird täglich gegen 03:00 neu erzeugt. Rührt sich sein Zeitstempel
 *  so lange nicht, liefert TYPO3 gar nicht mehr — der Zustand vom 2026-06-26
 *  (Redmine #4165). Das ist der einzige Weg, einen echten Ausfall schon in EINER
 *  Nacht zu erkennen: ein leerer und ein defekter Export sind inhaltlich
 *  identisch (`"data": []`), ihre Zeitstempel sind es nicht. 36 h deckt einen
 *  ausgefallenen Export-Lauf ab, ohne bei verschobener Erzeugung zu zucken. */
export const FEED_STALE_HOURS = 36;

export interface EmptyFeedVerdict {
  status: 'failed' | 'skipped';
  code: string;
  reason: string;
  /** Die gezaehlte Arbeitsnacht-Serie INKLUSIVE dieses Laufs. Einzige Quelle
   *  fuer report.empty_streak — vorher rechnete das Journal `emptyStreak + 1`
   *  selbst nach und haette die Wochenend-Regel ein zweites Mal gebraucht. */
  streak: number;
}

/** Ein Lauf ohne verwertbares Event ist mehrdeutig — diese Funktion trennt den
 *  Defekt vom Normalbetrieb, damit nur ersterer die Nachtmail auslöst.
 *
 *  Bewusst NICHT mehr an `institutes.length` (siehe Kopfkommentar): eine leere
 *  Gruppenliste ist der Normalfall an jedem Tag ohne Neuzugang, sie trennt
 *  nichts. Die drei Signale, die wirklich trennen:
 *
 *  - Rohdaten da, aber der Adapter hat alles verworfen (kein Startdatum) ⇒
 *    Feed-Inhalt und Parser driften auseinander ⇒ 'failed', echter Alarm.
 *  - Zeitstempel steht (> FEED_STALE_HOURS alt) ⇒ der Export wird gar nicht
 *    mehr erzeugt ⇒ 'failed', echter Alarm. Greift schon in der ersten Nacht.
 *  - Leer, aber frisch erzeugt ⇒ Normalbetrieb ⇒ 'skipped' … bis die Serie
 *    EMPTY_FEED_ALARM_STREAK erreicht; dann liefert der Export zwar noch, aber
 *    unplausibel lange nichts ⇒ 'failed'.
 *
 *  Alle Fälle werden journalisiert, damit die Nacht nachweisbar bleibt. */
export function classifyEmptyFeed(args: {
  droppedNoStart: number;
  generatedAtTimestamp: number | null;
  /** Leere Läufe unmittelbar VOR diesem, aus dem Journal gezählt. */
  emptyStreak: number;
  now: Date;
}): EmptyFeedVerdict {
  const { droppedNoStart, generatedAtTimestamp, emptyStreak, now } = args;

  // Deckt DIESE Nacht ein Wochenende ab, ist sie strukturell leer und darf die
  // Serie nicht um eins weiterdrehen. Alarmieren kann sie dadurch nie allein.
  const streak = emptyStreak + (coversWorkday(generatedAtTimestamp) ? 1 : 0);

  if (droppedNoStart > 0) {
    return {
      status: 'failed',
      code: 'all_events_dropped',
      streak,
      reason:
        `Alle ${droppedNoStart} Roh-Events verworfen (kein verwertbares ` +
        `Startdatum): Feed-Inhalt und Parser driften auseinander`,
    };
  }

  const ageHours =
    generatedAtTimestamp == null
      ? null
      : (now.getTime() - generatedAtTimestamp * 1000) / 3_600_000;
  if (ageHours != null && ageHours > FEED_STALE_HOURS) {
    return {
      status: 'failed',
      code: 'feed_stale',
      streak,
      reason:
        `Export seit ${Math.floor(ageHours)} h nicht neu erzeugt ` +
        `(Schwelle ${FEED_STALE_HOURS} h): TYPO3 liefert nicht mehr`,
    };
  }

  if (streak >= EMPTY_FEED_ALARM_STREAK) {
    return {
      status: 'failed',
      code: 'feed_empty_streak',
      streak,
      reason:
        `${streak} Arbeitsnächte in Folge ohne neues Event (Schwelle ` +
        `${EMPTY_FEED_ALARM_STREAK}, Wochenenden zählen nicht): Export läuft, ` +
        `liefert aber nichts mehr`,
    };
  }

  return {
    status: 'skipped',
    code: 'no_new_events',
    streak,
    reason:
      `Feed ist frisch erzeugt, enthält aber kein neues Event ` +
      `(${streak}. Arbeitsnacht in Folge) — Normalbetrieb`,
  };
}

/** Zählt die Leer-Läufe unmittelbar vor `generatedAtTimestamp`. Kriterium ist
 *  `report.parsed = 0` statt des Reason-Codes: so zählen auch die Alt-Zeilen
 *  mit, die noch 'feed_structurally_empty' tragen. Mehr als die Schwelle muss
 *  nie gelesen werden — bei der ersten nicht-leeren Zeile bricht die Serie. */
async function countEmptyStreak(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  generatedAtTimestamp: number | null,
): Promise<number> {
  const rows = await tx
    .select({
      parsed: sql<string | null>`${ingestRuns.report}->>'parsed'`,
      ts: ingestRuns.generatedAtTimestamp,
    })
    .from(ingestRuns)
    .where(
      generatedAtTimestamp == null
        ? eq(ingestRuns.feed, EVENTS_FEED)
        : and(
            eq(ingestRuns.feed, EVENTS_FEED),
            lt(ingestRuns.generatedAtTimestamp, generatedAtTimestamp),
          ),
    )
    .orderBy(desc(ingestRuns.generatedAtTimestamp), desc(ingestRuns.appliedAt))
    .limit(STREAK_SCAN_LIMIT);

  let n = 0;
  for (const r of rows) {
    // Reihenfolge ist die Aussage: eine echte Lieferung bricht die Serie an
    // JEDEM Wochentag — auch samstags kann ein Event nachgetragen werden.
    // Erst danach wird gefiltert, was gar nicht haette gefuellt werden koennen.
    if (r.parsed !== '0') break;
    if (!coversWorkday(r.ts)) continue;
    n++;
    if (n >= EMPTY_FEED_ALARM_STREAK) break;
  }
  return n;
}

/** Schreibt/aktualisiert die ingest_runs-Zeile für diesen Feed. `generated_at_
 *  timestamp` ist NOT NULL — fehlt er im Feed, fällt der Cursor auf 0 zurück
 *  (degradiert: kein echter High-Water-Mark, aber der letzte Lauf ist erfasst).
 *  ON CONFLICT (feed, ts) DO UPDATE hält den Insert idempotent/race-fest. */
async function journal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    status: 'applied' | 'failed' | 'skipped';
    generatedAtTimestamp: number | null;
    generatedAt: string | null;
    sourceLabel: string;
    report: Record<string, unknown>;
  },
): Promise<void> {
  await tx
    .insert(ingestRuns)
    .values({
      feed: EVENTS_FEED,
      generatedAtTimestamp: args.generatedAtTimestamp ?? 0,
      generatedAtReadable: args.generatedAt,
      status: args.status,
      sourceLabel: args.sourceLabel,
      report: args.report,
    })
    .onConflictDoUpdate({
      target: [ingestRuns.feed, ingestRuns.generatedAtTimestamp],
      set: {
        appliedAt: sql`now()`,
        status: args.status,
        generatedAtReadable: args.generatedAt,
        sourceLabel: args.sourceLabel,
        report: args.report,
      },
    });
}
