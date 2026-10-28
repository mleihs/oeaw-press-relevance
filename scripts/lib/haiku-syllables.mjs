// Silbenzählung für das Haiku-Gate, CLI-Seite: die zwei schweren Wähler.
//
// Regelzähler, Lexikon und Abstimmung liegen seit Phase 1 der Auto-Bewertung in
// lib/shared/scoring/haiku-syllables.ts, damit der Bewertungskern der App
// dieselbe Prüfung fährt. Hier bleiben nur die beiden Zähler, die nicht ins
// Next-Bundle dürfen, und der Einstieg, der sie als Zusatzstimmen einspeist:
//
//   Regelzähler        146/147   99,3 %   blind bei Lehnwörtern (Code, Team)
//   espeak-ng (IPA)    143/147   97,3 %   blind bei -tion, Lücken in der IPA-Tabelle
//   hypher (TeX)       138/147   93,9 %   blind bei kurzen Wörtern
//
// Mit drei Stimmen entscheidet die Mehrheit; die Fehler der Zähler liegen an
// verschiedenen Stellen. Ohne Mehrheit ist ein Wort unklar und das Haiku fällt
// durch (fail closed). Das Lexikon (lib/shared/scoring/haiku-lexicon.json)
// schlägt jeden Zähler.
//
// espeak-ng, hypher und hyphenation.de sind devDependencies. Die App importiert
// dieses Modul nie: espeak-ng bringt 18,7 MB WASM mit und steht unter GPL-3.0,
// beides hat in einem Next-Bundle nichts verloren. Die Exporte des alten Moduls
// (ruleCount, countWord, checkHaiku, wordsOf, lexiconSize) bleiben erhalten.

import ESpeakNg from 'espeak-ng';
import Hypher from 'hypher';
import german from 'hyphenation.de';
import { splitHaiku } from '../../lib/shared/haiku.ts';
import {
  checkHaiku as checkHaikuShared,
  countWord as countWordShared,
  ruleCount,
  wordsOf,
  WORD_SPLIT,
  lexiconSize,
} from '../../lib/shared/scoring/haiku-syllables.ts';

export { ruleCount, wordsOf, WORD_SPLIT, lexiconSize };

const hypher = new Hypher(german);

// ---------------------------------------------------------------------------
// 1. hypher: TeX-Trennmuster.
// ---------------------------------------------------------------------------

export function hypherCount(word) {
  const w = word.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  return w ? hypher.hyphenate(w).length : 0;
}

// ---------------------------------------------------------------------------
// 2. espeak-ng: Phonemisierung, gezählt werden die Silbenkerne im IPA.
// ---------------------------------------------------------------------------

const IPA_VOWELS = 'aɐɑɒæeɛəɘɜiɪoɔøœɵɞuʊʌyʏɤɯ';
const ZWJ = '‍'; // verbindet Diphthong- und Affrikatenhälften zu einem Phon
const NON_SYLLABIC = '̯';

/** null, wenn espeak für dieses Wort kein verwertbares IPA liefert. */
export function nucleiFromIpa(ipa) {
  // Dieser WASM-Build schreibt '?', wo seine IPA-Tabelle eine Lücke hat — beim
  // deutschen /ʊɐ̯/ etwa (Lurch, Wurf, Kurve). Dann ist die Zahl wertlos, und ein
  // stilles 0 wäre die schlimmste Antwort.
  if (ipa.includes('?') || ipa.trim() === '') return null;
  const chars = [...ipa];
  let n = 0;
  for (let i = 0; i < chars.length; i++) {
    if (!IPA_VOWELS.includes(chars[i])) continue;
    if (chars[i - 1] === ZWJ) continue; // zweite Hälfte eines Diphthongs
    if (chars[i + 1] === NON_SYLLABIC) continue;
    n++;
  }
  return n;
}

const ESPEAK_ARGS = ['--phonout', 'out', '--sep=""', '-q', '--ipa=3', '-v', 'de'];

async function phonemize(words) {
  const espeak = await ESpeakNg({
    arguments: [...ESPEAK_ARGS, '-f', 'in.txt'],
    preRun: [(mod) => mod.FS.writeFile('in.txt', words.join('\n') + '\n')],
  });
  return espeak.FS
    .readFile('out', { encoding: 'utf8' })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Wort → Silbenzahl (oder null) für eine ganze Wortliste. Gebündelt, weil jeder
 * Aufruf das 18-MB-WASM-Modul neu instanziiert; ein Batch pro ~150 Wörtern statt
 * einem Aufruf pro Wort.
 */
export async function espeakCounts(words) {
  const out = new Map();
  const BATCH = 150;
  for (let i = 0; i < words.length; i += BATCH) {
    const chunk = words.slice(i, i + BATCH);
    const tokens = await phonemize(chunk);
    if (tokens.length === chunk.length) {
      chunk.forEach((w, j) => out.set(w, nucleiFromIpa(tokens[j])));
      continue;
    }
    // Ein Wort ist in mehrere Token zerfallen, die Zuordnung ist hin — dann
    // einzeln, langsam aber eindeutig.
    for (const w of chunk) out.set(w, nucleiFromIpa((await phonemize([w])).join('')));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Einstieg: Zusatzstimmen sammeln, shared abstimmen lassen.
// ---------------------------------------------------------------------------

/**
 * Zusatzstimmen eines Wortes für die shared Abstimmung. Reihenfolge der
 * Stimmen: Regel (shared), hypher, espeak, wie vor dem Umzug.
 *
 * @param {string} word
 * @param {Map<string, number|null>} [espeakMap]
 */
const extraVotesFor = (word, espeakMap) => ({
  hypher: hypherCount(word),
  espeak: espeakMap?.get(word) ?? null,
});

/**
 * Silbenzahl eines Wortes mit allen drei Stimmen: Lexikon schlägt Mehrheit,
 * Mehrheit schlägt nichts.
 *
 * @param {string} word
 * @param {Map<string, number|null>} [espeakMap]
 */
export const countWord = (word, espeakMap) => countWordShared(word, extraVotesFor(word, espeakMap));

/**
 * Vollständige Prüfung eines Haikus mit allen drei Stimmen.
 *
 * @param {unknown} text
 * @param {Map<string, number|null>} [espeakMap]
 */
export function checkHaiku(text, espeakMap) {
  const votes = new Map(haikuWords(text).map((w) => [w, extraVotesFor(w, espeakMap)]));
  return checkHaikuShared(text, votes);
}

/** Wörter eines Haikus, leer, wenn es sich nicht in drei Zeilen teilen lässt. */
function haikuWords(text) {
  const lines = typeof text === 'string' ? splitHaiku(text.trim()) : null;
  return lines ? lines.flatMap(wordsOf) : [];
}

/**
 * Der Einstieg für Aufrufer: prüft eine Liste Haikus und phonemisiert dafür alle
 * vorkommenden Wörter in einem Rutsch.
 *
 * @param {unknown[]} texts
 * @returns {Promise<import('../../lib/shared/scoring/haiku-syllables.ts').HaikuBefund[]>}
 */
export async function checkHaikus(texts) {
  const vocabulary = [...new Set(texts.flatMap(haikuWords))];
  const espeakMap = vocabulary.length > 0 ? await espeakCounts(vocabulary) : new Map();
  return texts.map((t) => checkHaiku(t, espeakMap));
}
