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
          // Urteils und ohne sie im Nachhinein nicht rekonstruierbar.
          empty_streak: emptyStreak + 1,
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

/** Ab so vielen Leernächten AM STÜCK ist „nichts Neues" kein Zufall mehr.
 *  Kalibriert an 41 Läufen seit 2026-07-16: 34 % aller Nächte sind leer, die
 *  längsten echten Leer-Serien waren 3 Tage (26.–28.07., 01.–03.08., 15.–17.08.),
 *  jeweils über ein Wochenende. 5 lässt darüber Luft und schlägt trotzdem an,
 *  bevor ein echter Ausfall eine ganze Woche unbemerkt bleibt. */
export const EMPTY_FEED_ALARM_STREAK = 5;

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

  if (droppedNoStart > 0) {
    return {
      status: 'failed',
      code: 'all_events_dropped',
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
      reason:
        `Export seit ${Math.floor(ageHours)} h nicht neu erzeugt ` +
        `(Schwelle ${FEED_STALE_HOURS} h): TYPO3 liefert nicht mehr`,
    };
  }

  const streak = emptyStreak + 1;
  if (streak >= EMPTY_FEED_ALARM_STREAK) {
    return {
      status: 'failed',
      code: 'feed_empty_streak',
      reason:
        `${streak} Nächte in Folge ohne neues Event (Schwelle ` +
        `${EMPTY_FEED_ALARM_STREAK}): Export läuft, liefert aber nichts mehr`,
    };
  }

  return {
    status: 'skipped',
    code: 'no_new_events',
    reason:
      `Feed ist frisch erzeugt, enthält aber kein neues Event ` +
      `(${streak}. Nacht in Folge) — Normalbetrieb`,
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
    .select({ parsed: sql<string | null>`${ingestRuns.report}->>'parsed'` })
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
    .limit(EMPTY_FEED_ALARM_STREAK);

  let n = 0;
  for (const r of rows) {
    if (r.parsed !== '0') break;
    n++;
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
