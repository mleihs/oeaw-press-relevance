// Severity-Entscheidung des Nacht-Ingest, als reine Funktion aus der Route
// gezogen: die Route bleibt dünn, die Regel ist testbar. Sie beantwortet genau
// eine Frage — verdient dieser Lauf einen Alarm?
//
// Hintergrund (Post-mortem 2026-07-21): vorher galt
//   ok = alle Feeds applied/skipped && KEINE Warnung
// Damit kippte JEDE nicht-fatale Warnung den Lauf auf ok:false. In der Nacht auf
// den 21.07. meldete das einen vollständig erfolgreichen Import (3 Pubs, 1 Event)
// als Fehlschlag — Ursache war eine einzige Junction, die auf einen Personensatz
// zeigte, den der OeAW-Export selbst leer ausgeliefert hat. Ein Upstream-Defekt,
// den wir nicht beheben können; er darf das Team nicht nachts anpiepen.

/** Ab so vielen Drift-Signalen in EINEM Lauf ist es kein Upstream-Rauschen mehr,
 *  sondern ein auseinanderlaufender Korpus — dann soll der Nachtlauf sehr wohl
 *  schreien.
 *
 *  Seit 2026-08-31 zählen Personen-Waisen NICHT mehr in diese Summe (Regel
 *  single-sourced in `alarmRelevantDrift` unten, Begründung dort). Was hier
 *  ankommt, sind nur noch Orgunit-Waisen + unaufgelöste Typangaben — real 0
 *  pro Nacht; die Schwelle lässt Luft, ohne blind zu werden. */
export const DRIFT_ALARM_THRESHOLD = 25;

/** Kollaps-Guard für Personen-Waisen: bis hierher sind sie die dokumentierte
 *  WebDB-Personenlücke, ab hier zählen sie doch zur Alarm-Drift.
 *
 *  Wertwahl (docs/NIGHTLY_REVIEW_BASELINE.md + WEBDB_PERSON_GAP.md §8): normale
 *  Delta-Nächte liegen bei 16–80 Fällen, der größte belegte gutartige Lauf war
 *  der Volldump vom 22.08. mit 343. 400 liegt klar über allem beobachteten
 *  Normalrauschen, aber weit unter dem, was ein echter Personen-Korpus-Kollaps
 *  produziert (TYPO3 liefert Publikationen + Junctions, aber keine Personen ⇒
 *  apply_publications_delta droppt ALLE Junctions via inner JOIN, tausendfach
 *  — und der Idempotenz-Key verhindert die Nachlieferung). */
export const PERSON_ORPHAN_COLLAPSE_THRESHOLD = 400;

/** Report-Werte defensiv lesen: `Number(undefined ?? 0)` wäre ok, aber ein
 *  nicht-numerischer Report-Wert ergäbe NaN — und `NaN >= 25` ist false, die
 *  Alarm-Kette wäre fail-open. Gleiches Idiom wie `num()` in drift.ts. */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** Alarm-relevante Drift eines Publications-Reports — die EINE Stelle für die
 *  Regel „Personen-Waisen zählen nicht zur Alarm-Drift" (bis 2026-08-31 war sie
 *  dreifach handkodiert: countDrift, collectWarnings, drift.ts-`alarming`).
 *
 *  Personen-Waisen (`person_link_orphans`) zählen seit 2026-08-31 bewusst NICHT
 *  mit (WEBDB_PERSON_GAP.md §8): 43,5 % aller Autorenverknüpfungen zeigen schon
 *  in der QUELLE ins Leere, der Anteil skaliert mit der Nachtgröße (08.08.: 80
 *  Fälle ⇒ Fehlalarm) und ein Vollabgleich kann nichts reparieren. AUSNAHME ist
 *  der Kollaps-Guard oben: ab PERSON_ORPHAN_COLLAPSE_THRESHOLD ist es kein
 *  Quellenrauschen mehr, sondern ein lautloser Autorenschafts-Verlust — dann
 *  fließt der volle Wert doch ein.
 *
 *  Gatet bewusst NICHT auf report.status: drift.ts filtert per SQL bereits auf
 *  status='applied', countDrift gatet selbst. */
export function alarmRelevantDrift(report: Record<string, unknown>): number {
  const personOrphans = num(report.person_link_orphans);
  return (
    num(report.orgunit_link_orphans) +
    num(report.unresolved_publication_type) +
    num(report.unresolved_member_type) +
    (personOrphans >= PERSON_ORPHAN_COLLAPSE_THRESHOLD ? personOrphans : 0)
  );
}

export interface FeedOutcome {
  status: string;
  [k: string]: unknown;
}

export interface RunClassification {
  /** false ⇒ echter Alarm (Mail + Sentry + fehlgeschlagener Cron-Check-in). */
  ok: boolean;
  /** Angewandt, aber mit Drift-Signalen. Wird geloggt, alarmiert NICHT. */
  degraded: boolean;
  /** Einzeilige Diagnose für Alarm-Titel und Betreffzeile. */
  summary: string;
  failed: Array<{ feed: string; status: string; reason: string | null }>;
  warnings: string[];
  /** Summe der Drift-Signale über alle Feeds. */
  drift: number;
}

export function classifyRun(
  feeds: Record<string, FeedOutcome>,
): RunClassification {
  const entries = Object.entries(feeds);

  const failed = entries
    .filter(([, f]) => f.status !== 'applied' && f.status !== 'skipped')
    .map(([feed, f]) => ({
      feed,
      status: f.status,
      reason: (f.reason ?? f.error ?? null) as string | null,
    }));

  // Feed-Präfix, damit im Alarm sofort sichtbar ist, WO die Drift auftrat.
  const warnings = entries.flatMap(([feed, f]) =>
    (Array.isArray(f.warnings) ? (f.warnings as string[]) : []).map(
      (w) => `${feed}: ${w}`,
    ),
  );

  const drift = entries.reduce(
    (n, [, f]) => n + (typeof f.driftTotal === 'number' ? f.driftTotal : 0),
    0,
  );
  const driftAlarm = drift >= DRIFT_ALARM_THRESHOLD;

  const ok = failed.length === 0 && !driftAlarm;
  const degraded = ok && warnings.length > 0;

  return { ok, degraded, summary: buildSummary(failed, warnings, drift, driftAlarm), failed, warnings, drift };
}

/** Nennt WAS kaputt ist, nicht den halben JSON-Body: der Empfänger soll die
 *  Ursache in der Betreffzeile sehen, ohne das Event aufzuklappen. */
function buildSummary(
  failed: RunClassification['failed'],
  warnings: string[],
  drift: number,
  driftAlarm: boolean,
): string {
  const parts = failed.map(
    (f) => `${f.feed} ${f.status}${f.reason ? `: ${f.reason}` : ''}`,
  );
  if (driftAlarm) {
    parts.push(
      `${drift} Drift-Signale in einem Lauf (Schwelle ${DRIFT_ALARM_THRESHOLD}): ` +
        `Voll-Reconciliation gegen den Gesamtkorpus fällig`,
    );
  }
  if (parts.length > 0) return parts.join(' | ');
  if (warnings.length > 0) {
    return `angewandt mit ${warnings.length} Warnung(en): ${warnings[0]}`;
  }
  return 'alle Feeds sauber';
}
