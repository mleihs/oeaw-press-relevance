import { describe, it, expect } from 'vitest';
import { inArray, TransactionRollbackError } from 'drizzle-orm';
import { db, events } from '@/lib/server/db';
import type { NormalizedEvent } from '@/lib/server/ingest/adapters/typo3-events';
import { upsertEvents, type EventsDbExecutor } from './sync';

/**
 * Integrationstest für Bestandsschutz und Re-Score-Schutz in upsertEvents
 * gegen echtes Postgres: die SET-Ausdrücke (COALESCE, bodyKey, CASE) sind
 * SQL-Semantik, die der Mock in sync.test.ts nicht prüfen kann.
 *
 * Self-Skip wie apply-delta-smoke.test.ts: läuft nur, wenn DATABASE_URL auf
 * die lokale Dev-DB (Port 54422) zeigt. Alles läuft in EINER Transaktion, die
 * am Ende zurückgerollt wird; es bleibt keine Zeile stehen.
 */
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /(?:127\.0\.0\.1|localhost):54422\b/.test(dbUrl);

// Weit über allen realen TYPO3-uids, kollisionsfrei.
const B = 88_900_000;

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 30 * DAY).toISOString();
const PAST = new Date(Date.now() - 30 * DAY).toISOString();

/** Der Eckdaten-Text, wie ihn Dump und Feed für GMI-Talks liefern. */
const GMI_BODY =
  'Date: 2026-12-01, Time: 11:30:00, Speaker: Linda Odenthal-Hesse,, Location: Max Perutz Labs SR 1 (6.501), Type: SFB "Meiosis" Talk';

function ev(uid: number, over: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    webdbUid: B + uid,
    title: `Smoke ${uid}`,
    teaser: null,
    bodytext: null,
    eventInformation: null,
    eventAt: FUTURE,
    eventEndAt: null,
    locationTitle: null,
    organizerTitle: null,
    institute: 'GMI',
    url: null,
    lang: null,
    availableLangs: [],
    ...over,
  };
}

/** Bestand: bewertete Zeile, wie sie ein früherer Lauf hinterlassen hat. */
const scored = { analysisStatus: 'analyzed', eventScore: 0.42, reasoning: 'in-chat', pitchSuggestion: 'Pitch' } as const;

async function seed(tx: EventsDbExecutor, rows: NormalizedEvent[], source: 'feed' | 'webdb_dump' = 'webdb_dump') {
  await tx.insert(events).values(rows.map((r) => ({ ...r, ...scored, discoveredVia: source })));
}

async function read(tx: EventsDbExecutor, uids: number[]) {
  const rows = await tx
    .select({
      uid: events.webdbUid,
      bodytext: events.bodytext,
      url: events.url,
      lang: events.lang,
      availableLangs: events.availableLangs,
      status: events.analysisStatus,
      score: events.eventScore,
      reasoning: events.reasoning,
    })
    .from(events)
    .where(inArray(events.webdbUid, uids.map((u) => B + u)));
  return new Map(rows.map((r) => [r.uid - B, r]));
}

/** Führt `fn` in einer Transaktion aus und rollt sie danach zurück. */
async function inRollback(fn: (tx: EventsDbExecutor) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
}

describe.skipIf(!isLocal)('upsertEvents gegen Postgres (lokaler Stack)', () => {
  it('Feed: Bestandsschutz und Re-Score-Schutz für bodytext, url, lang', async () => {
    await inRollback(async (tx) => {
      await seed(tx, [
        // 1: Dump-Text mit Leerzeichen am Rand, Feed liefert ihn getrimmt.
        ev(1, { bodytext: ` ${GMI_BODY} ` }),
        // 2: bisher kein Text, Feed liefert den ersten.
        ev(2),
        // 3: echter neuer Text.
        ev(3, { bodytext: 'Alter Text.' }),
        // 4: Dump-Felder, die der Feed nicht kennt (www bis heute ohne bodytext).
        ev(4, { bodytext: '<p>Text aus dem Dump.</p>', url: 'https://www.oeaw.ac.at/x', lang: 'de', availableLangs: ['de', 'en'] }),
        // 5: HTML im Bestand, der Feed liefert denselben Text ohne Tags.
        ev(5, { bodytext: '<p>Ein <b>Vortrag</b> über Meiose.</p>' }),
        // 6: vergangenes Event mit neuem Text: Bewertung bleibt immer.
        ev(6, { bodytext: 'Alt.', eventAt: PAST }),
        // 7: Titeländerung löst wie bisher aus.
        ev(7, { bodytext: GMI_BODY }),
      ]);

      const res = await upsertEvents(
        [
          ev(1, { bodytext: GMI_BODY }),
          ev(2, { bodytext: GMI_BODY }),
          ev(3, { bodytext: 'Neuer Text.' }),
          ev(4),
          ev(5, { bodytext: 'Ein Vortrag über Meiose.' }),
          ev(6, { bodytext: 'Neu.', eventAt: PAST }),
          ev(7, { title: 'Neuer Titel', bodytext: GMI_BODY }),
        ],
        tx,
        'feed',
      );
      expect(res).toEqual({ imported: 0, updated: 7 });

      const r = await read(tx, [1, 2, 3, 4, 5, 6, 7]);
      // 1: Text bleibt wie gespeichert, Bewertung bleibt.
      expect(r.get(1)).toMatchObject({ bodytext: ` ${GMI_BODY} `, status: 'analyzed', score: 0.42 });
      // 2: Text kommt dazu, Bewertung bleibt (RESCORE_ON_FIRST_BODYTEXT aus).
      expect(r.get(2)).toMatchObject({ bodytext: GMI_BODY, status: 'analyzed', score: 0.42, reasoning: 'in-chat' });
      // 3: neuer Text, Bewertung zurückgesetzt.
      expect(r.get(3)).toMatchObject({ bodytext: 'Neuer Text.', status: 'pending', score: null, reasoning: null });
      // 4: nichts gelöscht, Bewertung bleibt.
      expect(r.get(4)).toMatchObject({
        bodytext: '<p>Text aus dem Dump.</p>',
        url: 'https://www.oeaw.ac.at/x',
        lang: 'de',
        availableLangs: ['de', 'en'],
        status: 'analyzed',
        score: 0.42,
      });
      // 5: gleicher Text in anderer Form: HTML bleibt, Bewertung bleibt.
      expect(r.get(5)).toMatchObject({ bodytext: '<p>Ein <b>Vortrag</b> über Meiose.</p>', status: 'analyzed', score: 0.42 });
      // 6: vergangen: Text aktualisiert, Bewertung bleibt.
      expect(r.get(6)).toMatchObject({ bodytext: 'Neu.', status: 'analyzed', score: 0.42 });
      // 7: Titel geändert: zurückgesetzt wie bisher.
      expect(r.get(7)).toMatchObject({ status: 'pending', score: null });
    });
  });

  it('Feed: derselbe Export zweimal ändert nichts mehr', async () => {
    await inRollback(async (tx) => {
      await seed(tx, [ev(11, { bodytext: ` ${GMI_BODY} `, url: 'https://www.oeaw.ac.at/y', lang: 'en' })]);
      const batch = [ev(11, { bodytext: GMI_BODY })];
      await upsertEvents(batch, tx, 'feed');
      await upsertEvents(batch, tx, 'feed');
      expect((await read(tx, [11])).get(11)).toMatchObject({
        bodytext: ` ${GMI_BODY} `,
        url: 'https://www.oeaw.ac.at/y',
        lang: 'en',
        status: 'analyzed',
        score: 0.42,
      });
    });
  });

  it('Dump bleibt maßgeblich: überschreibt die Felder, Neubewertung nur bei echter Textänderung', async () => {
    await inRollback(async (tx) => {
      await seed(
        tx,
        [
          ev(21, { bodytext: ` ${GMI_BODY} `, url: 'https://www.oeaw.ac.at/z', lang: 'de', availableLangs: ['de'] }),
          ev(22, { bodytext: 'Bisheriger Text.' }),
          ev(23),
        ],
        'feed',
      );
      await upsertEvents(
        [
          ev(21, { bodytext: GMI_BODY }),
          ev(22, { bodytext: 'Ganz anderer Text.' }),
          ev(23, { bodytext: 'Erster Text aus dem Dump.' }),
        ],
        tx,
        'webdb_dump',
      );
      const r = await read(tx, [21, 22, 23]);
      // Nur die Form ändert sich: Dump-Wert gilt, keine Neubewertung.
      expect(r.get(21)).toMatchObject({ bodytext: GMI_BODY, url: null, lang: null, availableLangs: [], status: 'analyzed', score: 0.42 });
      expect(r.get(22)).toMatchObject({ bodytext: 'Ganz anderer Text.', status: 'pending', score: null });
      expect(r.get(23)).toMatchObject({ bodytext: 'Erster Text aus dem Dump.', status: 'analyzed', score: 0.42 });
    });
  });
});
