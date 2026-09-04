#!/usr/bin/env tsx
// Zieht künftige Events aus einem WebDB-Dump nach, die der nächtliche Export
// nie geliefert hat — und KENNZEICHNET sie als solche (`discovered_via`).
//
// Warum es das braucht (Befund 2026-09-03): der Nacht-Ingest liest den
// JSON-Export `event_news_grouped`. Der ist ein Delta-Feed über eine FESTE
// Menge von News-Ordnern. Legt eine Redaktion ein Event in einem Ordner an,
// den der Export nicht einsammelt, kommt es nie bei uns an, und es fällt
// niemandem auf: es fehlt ja nur etwas, das nie da war. Gemessen am Dump vom
// 2026-09-03 waren das 8 künftige Events aus vier Ordnern (u. a. IMAFO
// "News HI" pid 7523 — an keinem der 35 archivierten Export-Tage dabei).
//
// ABGRENZUNG zu `npm run sync-events`: das Skript hier PRUNT NICHT.
// sync-events löscht künftige Events, die seine Quelle nicht kennt — auf prod
// hätte das am 2026-08-13 zwölf künftige Events gelöscht, fünf davon bewertet
// (Runbook-Warnung in docs/WEBDB_IMPORT.md). Ein Dump ist ein Standbild von
// gestern; er darf ergänzen, aber nie über Abwesenheit entscheiden. Deshalb
// ist dieser Pfad rein additiv.
//
// Der Marker heilt: liefert der Export ein so gefundenes Event später doch
// noch, setzt der Feed-Lauf `discovered_via` zurück auf 'feed' (siehe
// EventSource in lib/server/events/sync.ts). Genau das trennt die beiden
// Fälle ohne Handarbeit — Events, die nur auf ihren nächsten Delta-Lauf
// warten, räumen sich von selbst ab; übrig bleiben die Ordner, die der
// Export strukturell nicht sieht.
//
// Voraussetzung: der Dump liegt im lokalen MySQL-Container (Port 54499,
// db `webdb`), siehe docs/WEBDB_IMPORT.md Schritt 2. Für Events genügen die
// Tabellen tx_news_domain_model_news, pages und tx_eventnews_domain_model_*.
//
// --refresh: DIE ANDERE HÄLFTE DESSELBEN BEFUNDS. Der Export ist ein Delta über
// `crdate`, nicht über `tstamp` — er liefert eine Zeile also genau einmal, am
// Anlagetag, und nie wieder. Wird ein Event danach in TYPO3 bearbeitet, bleibt
// unsere Kopie stehen: 74 von 74 Auslieferungen in 35 Archivtagen erfolgten am
// Anlagetag, obwohl 81 % der künftigen Events nachbearbeitet werden. Am
// 2026-09-04 hingen dadurch 21 künftige Events hinterher, darunter falsche
// Uhrzeiten, ein umgeschriebener Titel und drei Platzhalter, die in TYPO3
// längst einen echten Titel tragen (`audit-events-vs-dump.ts --drift-only`).
//
// `--refresh` schreibt diese Felder nach, aber NUR wo der Dump auch etwas zu
// sagen hat: ein leeres TYPO3-Feld überschreibt nie einen gefüllten Wert bei
// uns. Der Grund steht im Audit — Ort und Organisator zieht der Adapter teils
// aus Sidebar-HTML, das der Dump nicht kennt; ein stumpfes Überschreiben würde
// sie löschen. Es bleibt also auch hier dabei, dass ein Standbild von gestern
// ergänzen, aber nicht über Abwesenheit entscheiden darf.
//
// Ändert sich dabei bewertungsrelevanter Inhalt (Titel, Teaser, Text, Termin),
// setzt `upsertEvents` die zwischengespeicherte Bewertung zurück auf `pending`.
// Das ist beabsichtigt: ein Score, der zu einem alten Titel gehört, ist falsch,
// nicht bloß alt.
//
// Verwendung:
//   npx tsx scripts/import-events-from-dump.ts                    # Trockenlauf, local
//   npx tsx scripts/import-events-from-dump.ts --target=prod      # Trockenlauf, prod
//   npx tsx scripts/import-events-from-dump.ts --target=prod --apply
//   npx tsx scripts/import-events-from-dump.ts --institute=IMAFO --apply
//   npx tsx scripts/import-events-from-dump.ts --target=prod --refresh          # Trockenlauf
//   npx tsx scripts/import-events-from-dump.ts --target=prod --refresh --apply
//   npx tsx scripts/import-events-from-dump.ts --target=prod --refresh --backfill
//   npx tsx scripts/import-events-from-dump.ts --target=prod --refresh --backfill=all
//   npx tsx scripts/import-events-from-dump.ts --json

import {
  bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit,
} from './lib/bootstrap';

const { target, flags, confirmProd } = bootstrapScript('import-events-from-dump');

const flagValue = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = flags.includes('--apply');
const asJson = flags.includes('--json');
const refresh = flags.includes('--refresh');
// --backfill fuellt Felder, die bei uns leer sind. Zwei Stufen, weil die
// beiden Haelften unterschiedlich teuer sind: `safe` (Vorgabe) nimmt nur
// Felder, auf die upsertEvents NICHT mit einem Score-Reset reagiert; `all`
// nimmt auch Titel, Teaser, Text und Termin und wirft damit die Bewertungen
// weg. Auf prod waren das am 2026-09-04 gut hundert Zeilen.
const backfillArg = flags.find((f) => f === '--backfill' || f.startsWith('--backfill='));
const backfill: 'nein' | 'safe' | 'all' =
  !backfillArg ? 'nein' : backfillArg === '--backfill=all' ? 'all' : 'safe';

/** Felder, die der Dump verantworten kann. `webdbUid` ist der Schlüssel und
 *  steht deshalb nicht dabei; `discoveredVia` setzt upsertEvents. */
const REFRESH_FIELDS = [
  'title', 'teaser', 'bodytext', 'eventInformation', 'eventAt', 'eventEndAt',
  'locationTitle', 'organizerTitle', 'institute', 'url', 'lang', 'availableLangs',
] as const;
type RefreshField = (typeof REFRESH_FIELDS)[number];

/** Die Teilmenge, auf die `upsertEvents` mit einem Reset der Bewertung
 *  reagiert (`rescore` dort). Wer das anfasst, kostet einen Score. */
const RESCORE_FIELDS: readonly RefreshField[] = [
  'title', 'teaser', 'bodytext', 'eventInformation', 'eventAt',
];

/** Leer heißt: der Dump weiß dazu nichts. Dann gilt weiter, was bei uns steht. */
const leer = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** Werte für die Vorschau kürzen; HTML-Zeilenumbrüche stören die Ausgabe. */
const kurz = (v: unknown): string => {
  if (v == null) return '—';
  const s = Array.isArray(v) ? v.join(',') : String(v);
  const flach = s.replace(/<br\s*\/?>/gi, ' · ').replace(/\s+/g, ' ').trim();
  return flach.length > 80 ? `${flach.slice(0, 79)}…` : flach || '—';
};

/** Termine sekundengenau vergleichen, nicht als Text: die DB liefert
 *  `2026-10-14 08:30:00+00`, der Adapter `2026-10-14T08:30:00.000Z`. */
function gleich(feld: RefreshField, a: unknown, b: unknown): boolean {
  if (feld === 'eventAt' || feld === 'eventEndAt') {
    if (a == null || b == null) return a == null && b == null;
    return new Date(a as string).getTime() === new Date(b as string).getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return (a ?? null) === (b ?? null);
}

async function main(): Promise<void> {
  const instituteFilter = flagValue('institute')?.toLowerCase();

  // Dynamische Imports: lib/server/db liest DATABASE_URL beim Modul-Load,
  // der Bootstrap setzt sie oben — die Reihenfolge ist zwingend.
  const { fetchTypo3Events, normalizeTypo3Event } =
    await import('@/lib/server/ingest/adapters/typo3-events');
  const { db, events: eventsTable } = await import('@/lib/server/db');
  const { upsertEvents } = await import('@/lib/server/events/sync');

  // Derselbe Adapter wie der reguläre Sync: ein zweiter Abfragepfad würde
  // beim ersten Schema-Wechsel auseinanderlaufen. Er liefert genau die
  // künftigen Events (datetime >= UNIX_TIMESTAMP()).
  const raw = await fetchTypo3Events();
  const normalized = raw
    .map(normalizeTypo3Event)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .filter((e) =>
      !instituteFilter || (e.institute ?? '').toLowerCase().includes(instituteFilter));

  const known = await db.select({ uid: eventsTable.webdbUid }).from(eventsTable);
  const knownUids = new Set(known.map((r) => r.uid));
  const neu = normalized.filter((e) => !knownUids.has(e.webdbUid));

  if (refresh) {
    const { inArray } = await import('drizzle-orm');
    const imDump = normalized.filter((e) => knownUids.has(e.webdbUid));
    const bestand = imDump.length === 0 ? [] : await db
      .select().from(eventsTable)
      .where(inArray(eventsTable.webdbUid, imDump.map((e) => e.webdbUid)));
    const perUid = new Map(bestand.map((r) => [r.webdbUid, r]));

    // Zusammenführen: der Dump gewinnt Feld für Feld, aber nur wo er etwas hat.
    const zuSchreiben: typeof imDump = [];
    const berichte: string[] = [];
    const verlierenScore: number[] = [];
    let uebergangen = 0;
    for (const dumpEvent of imDump) {
      const row = perUid.get(dumpEvent.webdbUid);
      if (!row) continue;
      const merged = { ...dumpEvent };
      const geaendert: string[] = [];
      for (const feld of REFRESH_FIELDS) {
        const dumpWert = dumpEvent[feld];
        const unserWert = (row as Record<string, unknown>)[feld];
        if (leer(dumpWert)) {
          (merged as Record<string, unknown>)[feld] = unserWert;
          continue;
        }
        if (gleich(feld, dumpWert, unserWert)) continue;
        // ZWEI VERSCHIEDENE DINGE, die man nicht vermengen darf:
        //
        //   Korrektur — bei uns steht etwas, in TYPO3 etwas anderes. Das ist
        //   die Drift, um die es geht: TYPO3 hat recht, wir hinken hinterher.
        //
        //   Nachtrag — bei uns steht NICHTS. Das ist keine Drift, sondern eine
        //   Luecke des Feed-Pfads: der JSON-Export fuellt `bodytext`, `url`,
        //   `lang` fuer viele Zeilen gar nicht erst, waehrend der Dump-Adapter
        //   sie mitbringt. Auf prod betraf das am 2026-09-04 mehr als hundert
        //   Zeilen. Sie mitzuschreiben hiesse, hundert Bewertungen wegen einer
        //   Pfad-Differenz zu verwerfen, nicht wegen einer Aenderung in TYPO3.
        //   Deshalb nur auf ausdrueckliches --backfill.
        const nachtrag = leer(unserWert);
        const nachtragErlaubt = backfill === 'all'
          || (backfill === 'safe' && !RESCORE_FIELDS.includes(feld));
        if (nachtrag && !nachtragErlaubt) {
          (merged as Record<string, unknown>)[feld] = unserWert;
          uebergangen++;
          continue;
        }
        geaendert.push(`${feld}: ${kurz(unserWert)} → ${kurz(dumpWert)}`);
      }
      if (geaendert.length === 0) continue;
      zuSchreiben.push(merged);
      // Ein vorhandener Score gehoert zum ALTEN Inhalt. Aendert sich etwas
      // Bewertungsrelevantes, setzt upsertEvents ihn zurueck — das ist richtig,
      // aber es darf niemanden ueberraschen, deshalb steht es in der Vorschau.
      const kostetScore = row.eventScore != null
        && geaendert.some((z) => RESCORE_FIELDS.some((f) => z.startsWith(`${f}:`)));
      if (kostetScore) verlierenScore.push(dumpEvent.webdbUid);
      berichte.push(
        `  uid ${String(dumpEvent.webdbUid).padEnd(7)} ${dumpEvent.eventAt.slice(0, 16)}  ` +
        `${dumpEvent.title.trim().slice(0, 60)}` +
        (kostetScore ? `\n            ! Bewertung ${row.eventScore} wird zurueckgesetzt` : '') +
        '\n' + geaendert.map((z) => `            ${z}`).join('\n'),
      );
    }

    console.log(`[import-events-from-dump --refresh] target=${target} db=${redactedDatabaseUrl()}`);
    console.log(
      `Dump: ${normalized.length} künftige Events · davon bei uns bekannt ${imDump.length} · ` +
      `VERALTET: ${zuSchreiben.length}`,
    );
    berichte.forEach((b) => console.log(b));
    if (uebergangen > 0) {
      console.log(
        `\n${uebergangen} leere Felder uebergangen (bei uns nichts, im Dump etwas). ` +
        'Das ist eine Luecke des Feed-Pfads, keine Drift — mit --backfill ' +
        '(kostet keinen Score) oder --backfill=all (kostet Scores) mitschreiben.',
      );
    }
    if (verlierenScore.length > 0) {
      console.log(
        `\n! ${verlierenScore.length} bewertete Events verlieren ihren Score und ` +
        `landen wieder im Pool: ${verlierenScore.join(', ')}`,
      );
    }
    if (zuSchreiben.length === 0) return;

    if (!apply) {
      console.log('\nTrockenlauf — nichts geschrieben. Mit --apply ausführen.');
      return;
    }
    await confirmProd('import-events-from-dump --refresh');
    const result = await db.transaction((tx) => upsertEvents(zuSchreiben, tx, 'webdb_dump'));
    console.log(`\nAktualisiert: ${result.updated} Zeilen (neu angelegt: ${result.imported}).`);
    console.log(
      'Wo sich Titel, Teaser, Text oder Termin geändert haben, steht die Bewertung ' +
      'jetzt wieder auf pending und taucht im Pool auf (/bewerten).',
    );
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(neu, null, 2));
    return;
  }

  console.log(`[import-events-from-dump] target=${target} db=${redactedDatabaseUrl()}`);
  console.log(
    `Dump: ${normalized.length} künftige Events · DB kennt ${knownUids.size} uids · ` +
    `NEU (nie über den Feed gekommen): ${neu.length}`,
  );
  for (const e of neu) {
    console.log(`  uid ${String(e.webdbUid).padEnd(7)} ${e.eventAt.slice(0, 16)}  ` +
      `[${e.institute ?? '—'}] ${e.title.trim().slice(0, 70)}`);
  }
  if (!neu.length) return;

  if (!apply) {
    console.log('\nTrockenlauf — nichts geschrieben. Mit --apply ausführen.');
    return;
  }
  await confirmProd('import-events-from-dump');

  // Nur die unbekannten Zeilen gehen rein: bekannte Events aus einem Standbild
  // von gestern zu aktualisieren hieße, frischere Feed-Daten zu überschreiben.
  const result = await db.transaction((tx) => upsertEvents(neu, tx, 'webdb_dump'));

  console.log(
    `\nGeschrieben: ${result.imported} neu, ${result.updated} aktualisiert — ` +
    `alle mit discovered_via='webdb_dump'.`,
  );
  console.log(
    'Die neuen Events tragen analysis_status=pending und tauchen damit im ' +
    'Bewertungs-Pool auf (/bewerten).',
  );
}

main().catch((err: unknown) => {
  console.error('[import-events-from-dump] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
