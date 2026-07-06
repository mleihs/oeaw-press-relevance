/**
 * Kategoriale Akzentfarben für Social-Themen und -Kanäle (Mock Toolkit-Redesign
 * §Social: Theme-Chips, Gruppen-Badges, Kanal-Avatare, Kanal-Punkt der
 * Post-Karten). Zyklische Zuweisung per Index — Themen/Kanäle haben keine
 * eigene Farbe in den Daten. Alle Klassen literal (Tailwind-Scan) und
 * dark-fähig über translucent Tints bzw. dark:-Varianten.
 */
export interface SocialAccent {
  /** Farbpunkt (Theme-Chip, Kanal-Zeile der Post-Karte). */
  dot: string;
  /** Getintes Quadrat (Themen-Zähler-Badge der Gruppenköpfe). */
  badge: string;
  /** Voll gesättigtes Quadrat (Kanal-Avatar). */
  avatar: string;
  /** Aktiver Theme-Chip (Rand + Fläche + Text). */
  chipActive: string;
  /** Bild-Platzhalterfläche der Post-Karte. */
  imageTint: string;
}

export const SOCIAL_ACCENTS: SocialAccent[] = [
  {
    dot: 'bg-purple-600',
    badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
    avatar: 'bg-purple-600',
    chipActive: 'border-purple-600/60 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    imageTint: 'from-purple-500/15 via-purple-500/5 to-transparent text-purple-600/50',
  },
  {
    dot: 'bg-brand-500',
    badge: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    avatar: 'bg-brand-500',
    chipActive: 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    imageTint: 'from-brand-500/15 via-brand-500/5 to-transparent text-brand-500/50',
  },
  {
    dot: 'bg-amber-600',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    avatar: 'bg-amber-600',
    chipActive: 'border-amber-600/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    imageTint: 'from-amber-500/15 via-amber-500/5 to-transparent text-amber-600/50',
  },
  {
    dot: 'bg-emerald-600',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    avatar: 'bg-emerald-600',
    chipActive: 'border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    imageTint: 'from-emerald-500/15 via-emerald-500/5 to-transparent text-emerald-600/50',
  },
  {
    dot: 'bg-cyan-700',
    badge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    avatar: 'bg-cyan-700',
    chipActive: 'border-cyan-700/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    imageTint: 'from-cyan-500/15 via-cyan-500/5 to-transparent text-cyan-700/50',
  },
];

export function socialAccent(i: number): SocialAccent {
  return SOCIAL_ACCENTS[i % SOCIAL_ACCENTS.length];
}
