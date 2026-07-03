/**
 * ÖAW Design System — programmatischer Token-Spiegel.
 *
 * SSOT der Tokens sind die CSS-Variablen in `app/globals.css` (dort für
 * bg-/text-/border-/shadow-Utilities gemappt) + die lesbare Fassung in
 * `docs/design/DESIGN_SYSTEM.md`. Dieses Modul spiegelt die LIGHT-Werte für
 * Konsumenten, die Farben **programmatisch** brauchen (Inline-Styles, Canvas/
 * SVG, Charts — geplante Chart-Hex-Konsolidierung, DESIGN_ROLLOUT Phase D).
 * Dark-Werte leben nur in globals.css. Bei Abweichung gewinnt globals.css /
 * DESIGN_SYSTEM.md.
 *
 * Bewusst NICHT hier (Code-Review 2026-07-03 — Drittkopien entfernt):
 * Spalten-Swatch → `BOARD_COLUMN_SWATCHES` (lib/shared/board.ts, live);
 * Kanalfarben → DB-Seed `board_columns.color`; Score-Skala →
 * `lib/shared/score-utils.ts` (SCORE_BAND).
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

/** Semantische Zustände (Text/Tint/Border; light-Werte, dark s. globals.css). */
export const STATE = {
  info: { fg: '#0047bb', tint: '#eef4ff' },
  success: { fg: '#059669', tint: '#e7f7ef' },
  warning: { fg: '#d97706', ink: '#92620c', tint: '#fdf1e3', line: '#f4dcb8' },
  danger: { fg: '#dc2626', tint: '#fdeaea', line: '#f4c4c4' },
  soon: { fg: '#c2410c', tint: '#fdeee3' },
} as const;
