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
// Verwendung:
//   npx tsx scripts/import-events-from-dump.ts                    # Trockenlauf, local
//   npx tsx scripts/import-events-from-dump.ts --target=prod      # Trockenlauf, prod
//   npx tsx scripts/import-events-from-dump.ts --target=prod --apply
//   npx tsx scripts/import-events-from-dump.ts --institute=IMAFO --apply
//   npx tsx scripts/import-events-from-dump.ts --json

import {
  bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit,
} from './lib/bootstrap';

const { target, flags, confirmProd } = bootstrapScript('import-events-from-dump');

const flagValue = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = flags.includes('--apply');
const asJson = flags.includes('--json');

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
