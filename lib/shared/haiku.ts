/**
 * STRUCTURAL validation for the German haiku stored on every scored publication.
 *
 * This module deliberately knows nothing about syllables. It answers the cheap,
 * always-decidable half of "is this a haiku": three lines, the exact separator,
 * and a character inventory a syllable counter can actually pronounce. It has no
 * dependencies, so both the app (lib/server/analysis/batch.ts, the nightly
 * OpenRouter run) and the CLI gate can use it. The expensive half — 5-7-5 — lives
 * in scripts/lib/haiku-syllables.mjs, which needs the counting libraries and
 * therefore stays out of the app bundle.
 *
 * WHY A GATE AT ALL. The haiku is the one field no downstream code can sanity
 * check: a wrong press_score shows up against the calibration band, a leaked
 * `peer_reviewed` in `reasoning` is caught by a regex, but a four-syllable line
 * looks exactly like a five-syllable one to every consumer. It is written by an
 * LLM — in-chat by me, or by the nightly OpenRouter model — and both were
 * measured breaking the form: of 3.065 haikus in prod on 2026-09-03, 131 were not
 * even three lines, and of the unambiguously countable rest only 65.6 % of the
 * `opus-4.7-session` cohort held 5-7-5. The prompt asking for the form is not a
 * guarantee; this is.
 *
 * The character inventory is narrow on purpose. Digits are rejected because no
 * syllable counter can pronounce them (is "1975" four syllables or eight?), and a
 * haiku that cannot be counted cannot be gated. Quotes are rejected because they
 * break the evaluation JSON the in-chat pipeline parses. Dashes are rejected
 * because the project forbids them in copy (docs/writing-style.md) and
 * sanitizeText() in scripts/session-pipeline.ts silently rewrites em-dashes to
 * commas, which would change a line after it was counted.
 */

/** The classical form. Exported so the syllable gate and its tests share one source. */
export const HAIKU_PATTERN = [5, 7, 5] as const;

/** Exact separator between the three lines: space, slash, space. */
export const HAIKU_SEPARATOR = ' / ';

export interface HaikuIssue {
  /** Stable machine-readable kind, for counting violations by class. */
  code:
    | 'empty'
    | 'separator'
    | 'blank_line'
    | 'whitespace'
    | 'forbidden_char'
    | 'umlaut_digraph';
  /** German, addressed at whoever has to fix the haiku. */
  message: string;
  /** 1-based line, where the issue is local to one. */
  line?: number;
}

/**
 * Characters a line may contain: German letters, single spaces and the four
 * sentence marks that survive sanitizeText(). Everything else (digits, quotes,
 * dashes, brackets, HTML leftovers) is a violation, not a warning.
 */
const ALLOWED_CHAR = /^[A-Za-zÄÖÜäöüß ,.:;!?]+$/;

/**
 * `ae`/`oe`/`ue` written for `ä`/`ö`/`ü` — typewriter spelling the rubric forbids.
 * Detecting it without a dictionary is impossible in general, so this matches only
 * the cases where the digraph cannot be anything else: not after `q` (Quelle,
 * quer) and not inside a vowel cluster (neue, Treue, Bauer, Aerosol handled via
 * the leading-vowel guard). The residual false positive is a word like `Poesie`;
 * it costs one entry in the gate's lexicon, which is the intended escape hatch.
 */
const UMLAUT_DIGRAPH = /(?<![qQ])(?<![aeiouäöüAEIOUÄÖÜ])([AaOoUu]e)(?![aeiouäöüAEIOUÄÖÜ])/;

/**
 * The short list of German words where the digraph is genuine and not a stand-in
 * for an umlaut. Matched as a word prefix, lowercased. Kept here rather than in
 * the gate's lexicon because this module must stay dependency-free for the app.
 */
const DIGRAPH_OK = ['aero', 'aerob', 'poe', 'koef', 'aloe', 'oboe', 'zoe', 'duell'];

/**
 * Split a haiku into its three lines, or null if it is not separated correctly.
 * Callers that only need the lines (rendering, counting) use this; callers that
 * need to explain what is wrong use checkHaikuStructure().
 */
export function splitHaiku(text: string): [string, string, string] | null {
  const parts = text.split(HAIKU_SEPARATOR);
  return parts.length === 3 ? (parts as [string, string, string]) : null;
}

/**
 * All structural violations, in reading order. An empty array means the haiku is
 * structurally sound — it says nothing about the syllable count.
 */
export function checkHaikuStructure(raw: unknown): HaikuIssue[] {
  const issues: HaikuIssue[] = [];

  if (typeof raw !== 'string' || raw.trim() === '') {
    return [{ code: 'empty', message: 'Haiku fehlt oder ist leer.' }];
  }
  if (raw !== raw.trim()) {
    issues.push({ code: 'whitespace', message: 'Haiku hat führende oder folgende Leerzeichen.' });
  }

  const text = raw.trim();
  const parts = text.split(HAIKU_SEPARATOR);
  if (parts.length !== 3) {
    const slashes = (text.match(/\//g) ?? []).length;
    issues.push({
      code: 'separator',
      message:
        slashes === 2
          ? 'Trenner ist nicht exakt " / " (Leerzeichen, Slash, Leerzeichen).'
          : `Haiku braucht genau drei Zeilen, getrennt durch " / ". Gefunden: ${parts.length} Zeile(n), ${slashes} Slash(es).`,
    });
    return issues; // Per-line checks would only produce noise on a broken split.
  }

  parts.forEach((part, i) => {
    const line = i + 1;
    if (part.trim() === '') {
      issues.push({ code: 'blank_line', message: `Zeile ${line} ist leer.`, line });
      return;
    }
    if (part !== part.trim() || /\s{2,}/.test(part)) {
      issues.push({
        code: 'whitespace',
        message: `Zeile ${line} hat doppelte oder randständige Leerzeichen.`,
        line,
      });
    }
    if (!ALLOWED_CHAR.test(part)) {
      const bad = [...new Set([...part].filter((c) => !ALLOWED_CHAR.test(c)))].join('');
      issues.push({
        code: 'forbidden_char',
        message: `Zeile ${line} enthält unzulässige Zeichen: ${bad} (keine Ziffern, Anführungszeichen, Gedankenstriche oder Klammern).`,
        line,
      });
    }
    const offender = part
      .split(' ')
      .find((w) => UMLAUT_DIGRAPH.test(w) && !DIGRAPH_OK.some((ok) => w.toLowerCase().startsWith(ok)));
    if (offender) {
      issues.push({
        code: 'umlaut_digraph',
        message: `Zeile ${line}: ${offender} schreibt einen Umlaut als ae/oe/ue.`,
        line,
      });
    }
  });

  return issues;
}

/** True when the haiku passes every structural check. */
export function isStructurallyValidHaiku(raw: unknown): raw is string {
  return checkHaikuStructure(raw).length === 0;
}
