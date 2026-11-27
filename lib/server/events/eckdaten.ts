// Eckdaten statt Fließtext. Bei den Vienna-BioCenter-Instituten (GMI, IMBA,
// IMP, Max Perutz Labs) ist der TYPO3-bodytext eines Events keine Ankündigung,
// sondern eine Zeile Eckdaten:
//
//   Date: 2026-12-01, Time: 11:30:00, Speaker: Linda Odenthal-Hesse,,
//   Location: Max Perutz Labs SR 1 (6.501), Type: SFB "Meiosis" Talk,
//   Institute: Max-Planck-Institut für Evolutionsbiologie, Host: Irene Thiemann-Boege
//
// So kommt er aus dem WebDB-Dump und seit 2026-11-27 aus dem Export. Stand
// 27.11. hatten 123 Events in Prod dieses Format, alle mit genau diesen sieben
// Angaben. Varianten aus dem Bestand: mehrere Vortragende mit <br />, „None"
// oder leer für fehlende Angaben, doppelte Kommas, und „Institute" mal als
// Herkunft der vortragenden Person, mal als Zugangshinweis („Open only to
// IMP/IMBA/GMI/Max Perutz Labs").
//
// Rein: kein DB-Zugriff. Genutzt vom TYPO3-Entwurf (typo3-bridge/draft-prompt.ts),
// der die Eckdaten als eigenen Block statt als Fließtext an Claude gibt.

export const ECKDATEN_LABELS = ['Date', 'Time', 'Speaker', 'Location', 'Type', 'Institute', 'Host'] as const;
export type EckdatenLabel = (typeof ECKDATEN_LABELS)[number];
/** Je Angabe der bereinigte Wert, null für fehlend („None", leer). */
export type Eckdaten = Record<EckdatenLabel, string | null>;

/** Ab so vielen der sieben Angaben gilt ein Text als Eckdaten. */
const MIN_LABELS = 4;

/** Ein Label am Anfang oder nach einem Komma. Werte selbst enthalten Kommas
 *  („University of X, Department Y"), getrennt wird deshalb nur vor Labels. */
const LABEL_RE = new RegExp(`(?:^|,\\s*)(${ECKDATEN_LABELS.join('|')}):`, 'g');

function cleanValue(raw: string, label: EckdatenLabel): string | null {
  const v = raw
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;]+|[\s,;]+$/g, '');
  if (!v || /^none$/i.test(v)) return null;
  // Sekunden tragen nichts: „11:30:00" → „11:30".
  if (label === 'Time') return v.replace(/^(\d{1,2}:\d{2}):00$/, '$1');
  return v;
}

/** Eckdaten aus einem bodytext, oder null, wenn der Text keine Eckdaten ist. */
export function parseEckdaten(bodytext: string | null | undefined): Eckdaten | null {
  if (!bodytext) return null;
  const text = bodytext.replace(/^\s*<p>|<\/p>\s*$/gi, '').trim();
  if (!text.startsWith('Date:')) return null;

  const matches = [...text.matchAll(LABEL_RE)];
  if (new Set(matches.map((m) => m[1])).size < MIN_LABELS) return null;

  const out = Object.fromEntries(ECKDATEN_LABELS.map((l) => [l, null])) as Eckdaten;
  matches.forEach((m, i) => {
    const label = m[1] as EckdatenLabel;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    out[label] = cleanValue(text.slice(start, end), label);
  });
  return out;
}

/** Eine Zeile je Angabe, fehlende als „(leer)". */
export function formatEckdaten(e: Eckdaten): string {
  return ECKDATEN_LABELS.map((l) => `${l}: ${e[l] ?? '(leer)'}`).join('\n');
}
