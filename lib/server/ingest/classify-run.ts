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
 *  sondern ein auseinanderlaufender Korpus (z. B. der Export hört auf, Personen
 *  mitzuliefern) — dann soll der Nachtlauf sehr wohl schreien. Real liegt die
 *  Nacht-Drift bei 0–1; die Schwelle lässt Luft, ohne blind zu werden. */
export const DRIFT_ALARM_THRESHOLD = 25;

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
