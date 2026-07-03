/**
 * ÖAW Design System — programmatischer Token-Spiegel.
 *
 * SSOT der Tokens sind die CSS-Variablen in `app/globals.css` (dort für
 * bg-/text-/border-/shadow-Utilities gemappt) + die lesbare Fassung in
 * `docs/design/DESIGN_SYSTEM.md`. Dieses Modul spiegelt die Werte für
 * Konsumenten, die Farben **programmatisch** brauchen — Kanal-Akzente (keyed
 * nach Spaltenname), die Score-/Relevanz-Skala und die freie Spalten-Swatch —
 * dort, wo eine CSS-Utility nicht reicht (Inline-Styles, Kanvas/SVG, dynamische
 * Spaltenfarben). Bei Abweichung gewinnt globals.css / DESIGN_SYSTEM.md.
 *
 * Rollout: docs/DESIGN_ROLLOUT.md (Phase A2).
 */

/** Marke — ÖAW-Blau (500 = Primärmarke). */
export const BRAND = {
  50: '#eef4ff',
  100: '#dbe7ff',
  200: '#b8ccff',
  300: '#85a6ff',
  400: '#4b78ee',
  500: '#0047bb',
  600: '#003ea3',
  700: '#00337f',
  800: '#0a2a60',
  900: '#0d2450',
} as const;

/** Neutral — kühl getöntes Slate, nach Rolle (light-Werte; dark s. globals.css). */
export const NEUTRAL = {
  canvas: '#f7f8fa',
  surface: '#ffffff',
  surfaceMuted: '#fbfcfd',
  fill: '#eef1f5',
  line: '#e2e6ec',
  lineStrong: '#cbd2dc',
  inkMuted: '#9aa4b2',
  inkSubtle: '#64707f',
  inkSoft: '#475262',
  inkStrong: '#333d4c',
  inkHeading: '#212b38',
  ink: '#16202e',
} as const;

/** Semantische Zustände (Text/Tint/Border). */
export const STATE = {
  info: { fg: '#0047bb', tint: '#eef4ff' },
  success: { fg: '#059669', tint: '#e7f7ef' },
  warning: { fg: '#d97706', ink: '#92620c', tint: '#fdf1e3', line: '#f4dcb8' },
  danger: { fg: '#dc2626', tint: '#fdeaea', line: '#f4c4c4' },
  soon: { fg: '#c2410c', tint: '#fdeee3' },
} as const;

export interface ChannelAccent {
  /** Solid: Linksrand / Punkt / Icon. */
  accent: string;
  /** Modal-Header / Kartengrund. */
  tint: string;
  /** Dunkler Kanaltext auf Tint. */
  text: string;
}

/**
 * Kanal-Akzente der 8 Ausspielkanäle, keyed nach kleingeschriebenem
 * Spaltennamen (inkl. der Alias-Keys aus `app/board/_lib/channels.tsx`).
 * Default-Farbe für die Seed-Spalten des „Channels"-Boards; freie Boards
 * setzen ihre Spaltenfarbe frei (COLUMN_SWATCH) über die DB-Spalte `color`.
 */
export const CHANNEL_ACCENTS: Record<string, ChannelAccent> = {
  'pm/presse': { accent: '#2563eb', tint: '#eaf1ff', text: '#1e3a8a' },
  presse: { accent: '#2563eb', tint: '#eaf1ff', text: '#1e3a8a' },
  web: { accent: '#0d9488', tint: '#e6f7f4', text: '#0f766e' },
  'blog gö': { accent: '#7c3aed', tint: '#f2ecff', text: '#6d28d9' },
  blog: { accent: '#7c3aed', tint: '#f2ecff', text: '#6d28d9' },
  podcast: { accent: '#c026d3', tint: '#fbeafc', text: '#a21caf' },
  events: { accent: '#ea580c', tint: '#fdeee3', text: '#c2410c' },
  screens: { accent: '#16a34a', tint: '#e7f7ec', text: '#15803d' },
  'science pop': { accent: '#e11d48', tint: '#fdeaef', text: '#be123c' },
  zeitlos: { accent: '#64748b', tint: '#eef1f5', text: '#475569' },
};

export function channelAccent(name: string): ChannelAccent | null {
  return CHANNEL_ACCENTS[name.trim().toLowerCase()] ?? null;
}

/** Freie Spaltenfarben (Board-Verwaltung, 10er-Swatch). */
export const COLUMN_SWATCH = [
  '#2563eb', '#0d9488', '#7c3aed', '#c026d3', '#ea580c',
  '#16a34a', '#e11d48', '#64748b', '#0891b2', '#d97706',
] as const;

/**
 * Score-/Relevanz-Skala (0→100 %, Neutral→Marke, 8 Stufen). Deckt Press-Score,
 * Event-Score etc. ab (löst mittelfristig die feature-eigenen Skalen ab).
 */
export const SCORE_SCALE = [
  '#cbd2dc', '#9aa4b2', '#fbc98a', '#f59e42',
  '#e88a2a', '#6b93e6', '#2f6ad0', '#0047bb',
] as const;

/** Score (0..1) → Farbe der 8-stufigen Skala. Clamped. */
export function scoreColor(score01: number): string {
  const clamped = Math.max(0, Math.min(1, score01));
  const idx = Math.min(SCORE_SCALE.length - 1, Math.floor(clamped * SCORE_SCALE.length));
  return SCORE_SCALE[idx];
}
