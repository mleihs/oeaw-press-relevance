/**
 * Die drei Zeitfenster der Social-Beobachtung — die EINE Stelle, an der ihre
 * Grenzen und ihre Ordnung stehen.
 *
 * Sie bilden eine Kette, keine drei unabhängigen Regler:
 *
 *   abgerufen (fetch)  ⊇  ausgewertet (theme)  ⊇  als frisch markiert (fresh)
 *
 *   fetch  wie weit zurück Posts von Apify geholt werden. Das teuerste Fenster
 *          (Apify rechnet je Ergebnis ab) und die Obergrenze der beiden
 *          anderen: was nicht geholt wurde, kann nichts auswerten und nichts
 *          anzeigen. Bis 2026-07-21 als Env-Variable SOCIAL_WINDOW_DAYS
 *          versteckt, während die zwei harmloseren eine Oberfläche hatten.
 *   theme  woraus das LLM-Lagebild entsteht — und, über
 *          social_theme_snapshots.window_days, das Anzeigefenster der
 *          Dashboard-Kachel.
 *   fresh  ab wann ein Post in der Liste als „älter" einsortiert wird. Reine
 *          Darstellungsfrage.
 *
 * Vor dem Audit vom 2026-07-21 war diese Ordnung nirgends erzwungen: jedes
 * Fenster hatte seine eigene 1-365-Prüfung, und eine Auswertung über 30 Tage
 * bei 14 Tagen Abruf war problemlos einstellbar — sie hätte einfach still
 * weniger Posts gesehen als versprochen. Deshalb liegt die Regel jetzt hier,
 * geteilt von Zod-Schema, Server-Merge und Settings-Formular, mit der
 * CHECK-Bedingung aus Migration 20260721000003 als letzter Instanz.
 */

export const SOCIAL_WINDOW_MIN_DAYS = 1;
export const SOCIAL_WINDOW_MAX_DAYS = 365;

/** Beschriftungen der Fenster. Geteilt von Formular und Fehlermeldung, damit
 *  eine Meldung dasselbe Wort benutzt wie das Feld daneben. */
export const SOCIAL_WINDOW_LABELS = {
  fetch_window_days: 'Abrufzeitraum',
  theme_window_days: 'Auswertungszeitraum',
  fresh_window_days: 'Frisch-Markierung',
} as const;

/** Die Fenster in Pipeline-Reihenfolge: jedes muss ≤ seinem Vorgänger sein. */
export const SOCIAL_WINDOW_ORDER = [
  'fetch_window_days',
  'theme_window_days',
  'fresh_window_days',
] as const;

export type SocialWindowField = (typeof SOCIAL_WINDOW_ORDER)[number];

export type SocialWindows = Record<SocialWindowField, number>;

/** Spiegel der Spalten-Defaults aus 20260615000002 / 20260721000003. */
export const SOCIAL_WINDOW_DEFAULTS: SocialWindows = {
  fetch_window_days: 14,
  theme_window_days: 14,
  fresh_window_days: 7,
};

/**
 * Prüft die Kette. Gibt die ERSTE Verletzung als fertigen deutschen Satz
 * zurück, oder null, wenn alles passt.
 *
 * Bewusst ein Satz statt eines Fehlercodes: dieselbe Zeichenkette erscheint im
 * Formular unter dem Feld und als 400-Antwort der Route, wenn jemand am
 * Formular vorbei patcht. Zwei Formulierungen desselben Problems wären eine
 * Gelegenheit, dass sie auseinanderlaufen.
 */
export function checkSocialWindowOrder(w: SocialWindows): string | null {
  for (let i = 1; i < SOCIAL_WINDOW_ORDER.length; i++) {
    const outer = SOCIAL_WINDOW_ORDER[i - 1];
    const inner = SOCIAL_WINDOW_ORDER[i];
    if (w[inner] > w[outer]) {
      return `${SOCIAL_WINDOW_LABELS[inner]} (${w[inner]} Tage) darf nicht größer sein als ${SOCIAL_WINDOW_LABELS[outer]} (${w[outer]} Tage).`;
    }
  }
  return null;
}
