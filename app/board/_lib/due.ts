// Fälligkeits-Badge-Zustände (Design Book §1.6). overdue = offen & vor heute;
// soon = offen & 0..3 Tage; sonst normal. Datumsformat „D. Mon", Jahr nur wenn
// abweichend. Kalendertage-Differenz, damit „heute" nicht schon fällig ist.

export type DueState = 'overdue' | 'soon' | 'normal' | 'none';

const MONTHS_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

// Fälligkeitsdaten sind reine Kalenderdaten, gespeichert als UTC-Mitternacht
// (normalizeDue). Ihr Kalendertag wird daher aus den UTC-Komponenten gelesen;
// „heute" ist der lokale Kalendertag des Betrachters. So bleibt „10. Jul" in
// jeder Zeitzone der 10. Juli (statt in westlichen Zonen einen Tag früher
// überfällig zu werden). Aktivitäts-Zeitstempel (relativeDay) sind dagegen
// echte Zeitpunkte und bleiben lokal.
function dayNumberUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000;
}
function dayNumberLocal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
}

export function dueState(
  dueAt: string | null,
  completedAt: string | null,
  now: Date = new Date(),
): DueState {
  if (!dueAt) return 'none';
  const diff = dayNumberUTC(new Date(dueAt)) - dayNumberLocal(now);
  if (!completedAt && diff < 0) return 'overdue';
  if (!completedAt && diff <= 3) return 'soon';
  return 'normal';
}

export function formatDueLabel(dueAt: string, now: Date = new Date()): string {
  const d = new Date(dueAt);
  const base = `${d.getUTCDate()}. ${MONTHS_DE[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === now.getFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

export function formatDateTimeMeta(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
}

/** Relative Kurzform für Aktivität/„zuletzt aktiv" (heute/gestern/vor N Tagen). */
export function relativeDay(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '–';
  const diff = dayNumberLocal(now) - dayNumberLocal(new Date(iso));
  if (diff <= 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 30) return `vor ${diff} Tagen`;
  return formatDateTimeMeta(iso);
}
