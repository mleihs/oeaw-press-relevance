// Silbenzählung für das Haiku-Gate — die teure Hälfte von lib/shared/haiku.ts.
//
// WARUM DREI ZÄHLER. Es gibt für Deutsch keinen fertigen Validator. Die
// englischen Haiku-Checker zählen über das CMU-Aussprachewörterbuch, und die
// deutschen Silbenzähler-Webtools sind unbelegte Vokalgruppen-Heuristiken. Der
// verbreitetste Irrtum ist, Silbentrennung für Silbenzählung zu halten:
// TeX-Muster (hypher, pyphen) trennen mit `lefthyphenmin=2` und lassen kurze
// Wortanfänge grundsätzlich ungetrennt, weshalb `über`, `Atem`, `oder`, `Ecke`
// dort alle als einsilbig gelten.
//
// Gemessen an 147 handgezählten Zeilen (der 49er-Batch vom 2026-09-03):
//
//   Regelzähler        146/147   99,3 %   blind bei Lehnwörtern (Code, Team)
//   espeak-ng (IPA)    143/147   97,3 %   blind bei -tion, Lücken in der IPA-Tabelle
//   hypher (TeX)       138/147   93,9 %   blind bei kurzen Wörtern
//
// Die Fehler liegen an verschiedenen Stellen, deshalb entscheidet die Mehrheit.
// Gegenprobe des Regelzählers auf 5.351 unabhängigen Korpuswörtern: 99,12 %.
//
// FAIL CLOSED. Wo keine Mehrheit zustande kommt, liefert das Modul kein Ergebnis,
// sondern meldet das Wort als unklar. Der Aufrufer bricht dann ab. Das ist der
// Sinn der Sache: lieber ein Lexikoneintrag zu viel als ein ungeprüftes Haiku in
// der Datenbank. Das Lexikon (haiku-lexicon.json) schlägt jeden Zähler.
//
// espeak-ng, hypher und hyphenation.de sind devDependencies. Die App importiert
// dieses Modul nie — espeak-ng bringt 18,7 MB WASM mit und steht unter GPL-3.0,
// beides hat in einem Next-Bundle nichts verloren.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ESpeakNg from 'espeak-ng';
import Hypher from 'hypher';
import german from 'hyphenation.de';
import { HAIKU_PATTERN, checkHaikuStructure, splitHaiku } from '../../lib/shared/haiku.ts';

const hypher = new Hypher(german);

const LEXICON = JSON.parse(
  readFileSync(fileURLToPath(new URL('./haiku-lexicon.json', import.meta.url)), 'utf-8'),
);

// ---------------------------------------------------------------------------
// 1. Regelzähler: eine Silbe pro Vokalkern.
//
// Die Arbeit steckt in der Frage, wo eine Vokalfolge EIN Kern ist (Diphthong,
// Dehnung) und wo zwei (Hiat). Jede Sonderregel unten stammt aus einer gemessenen
// Abweichung gegen die beiden anderen Zähler, nicht aus dem Bauch.
// ---------------------------------------------------------------------------

const VOWELS = 'aeiouäöüy';
// `ui` steht bewusst NICHT dabei: außer in `pfui` ist es im Deutschen ein Hiat
// (Ru-i-ne, in-tu-i-tiv). `ai` bleibt drin, weil es einheimisch ein Diphthong ist
// (Mai, Kaiser, Waise); die Lehnwörter dagegen (Mo-sa-ik, Ko-ka-in) stehen im
// Lexikon, weil sich beides nicht per Regel trennen lässt.
const DIPHTHONGS = ['ei', 'ai', 'ey', 'ay', 'au', 'eu', 'äu', 'oi'];
const HIATUS = '|'; // interner Marker für eine erzwungene Silbengrenze

export function ruleCount(word) {
  let w = word.toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (!w) return 0;
  // Ein einzelner Buchstabe wird als Buchstabenname gesprochen (be, ce, de …).
  if (w.length === 1) return 1;

  w = w.replace(/qu/g, 'kv'); // das u in qu ist kein Kern (Quelle = Kvel-le)

  // Präfix vor Vokal: die Grenze verhindert, dass ge+ehrt als Doppelvokal
  // durchgeht (geehrt = ge-ehrt, nicht gehrt).
  w = w.replace(new RegExp(`^(ge|be)([${VOWELS}])`), `$1${HIATUS}$2`);

  // Dehnungs-h zwischen zwei Vokalen trennt (Ehe, Reihe, gehen); stummes h nach
  // Vokal vor Konsonant dehnt nur und verschwindet (sehr, Mehl).
  w = w.replace(new RegExp(`([${VOWELS}])h([${VOWELS}])`, 'g'), `$1${HIATUS}$2`);
  w = w.replace(new RegExp(`([${VOWELS}])h`, 'g'), '$1');

  // Wortausgänge, in denen die Vokalfolge entgegen der Grundregel auseinanderfällt.
  // Linien, Medien, Bakterien. Die Vorbedingung „irgendwo vorher ein Vokal"
  // haelt einsilbige Woerter heraus, die zufaellig auf -ien enden (Wien).
  w = w.replace(new RegExp(`(?<=[${VOWELS}][^${VOWELS}]*)ien$`), `i${HIATUS}en`);
  w = w.replace(/een$/, `e${HIATUS}en`); // Seen, Ideen, Feen
  w = w.replace(/eum(s?)$/, `e${HIATUS}um$1`); // Museum, Lyzeums
  w = w.replace(/uu/g, `u${HIATUS}u`); // Vakuum, Kontinuum, Individuum

  let n = 0;
  for (const run of w.split(new RegExp(`[^${VOWELS}${HIATUS}]+`)).filter(Boolean)) {
    for (const part of run.split(HIATUS).filter(Boolean)) n += nucleiInRun(part);
  }
  return n;
}

/** Kerne innerhalb einer ununterbrochenen Vokalfolge. */
function nucleiInRun(run) {
  let n = 0;
  let i = 0;
  while (i < run.length) {
    const pair = run.slice(i, i + 2);
    if (DIPHTHONGS.includes(pair) || pair === 'ie' || run[i] === run[i + 1]) {
      n++; // ein Kern: Diphthong, ie, oder Doppelvokal (Saal, Beere, Boot)
      i += 2;
      continue;
    }
    n++; // sonst Hiat: jeder Vokal ist ein eigener Kern (Chaos, Aorta, Nation)
    i++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 2. hypher: TeX-Trennmuster.
// ---------------------------------------------------------------------------

export function hypherCount(word) {
  const w = word.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  return w ? hypher.hyphenate(w).length : 0;
}

// ---------------------------------------------------------------------------
// 3. espeak-ng: Phonemisierung, gezählt werden die Silbenkerne im IPA.
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
// 4. Abstimmung.
// ---------------------------------------------------------------------------

export const WORD_SPLIT = /[^\p{L}]+/u;
export const wordsOf = (line) => line.split(WORD_SPLIT).filter(Boolean);

/**
 * Silbenzahl eines Wortes: Lexikon schlägt Mehrheit, Mehrheit schlägt nichts.
 * `count` ist null, wenn keine zwei Zähler übereinstimmen — dann muss das Wort
 * ins Lexikon, bevor ein Haiku damit durchkommt.
 */
/**
 * @param {string} word
 * @param {Map<string, number|null>} [espeakMap]
 * @returns {{word: string, count: number|null, source: string, votes: any}}
 */
export function countWord(word, espeakMap) {
  const key = word.toLowerCase();
  if (Object.hasOwn(LEXICON.words, key)) {
    return { word, count: LEXICON.words[key], source: 'lexikon', votes: null };
  }
  const votes = {
    regel: ruleCount(word),
    hypher: hypherCount(word),
    espeak: espeakMap?.get(word) ?? null,
  };
  const cast = [votes.regel, votes.hypher, votes.espeak].filter((v) => typeof v === 'number');
  for (const value of cast) {
    if (cast.filter((v) => v === value).length >= 2) {
      return { word, count: value, source: 'mehrheit', votes };
    }
  }
  return { word, count: null, source: 'unklar', votes };
}

/**
 * @typedef {object} HaikuBefund
 * @property {string} text          das geprüfte Haiku
 * @property {boolean} ok           true nur bei sauberer Struktur UND sicherem 5-7-5
 * @property {{kind: string, code: string, line?: number, message: string}[]} issues
 * @property {(number|null)[]} counts   Silben je Zeile, null wo nicht bestimmbar
 * @property {{word: string, votes: object}[]} unclear   Wörter fürs Lexikon
 */

/**
 * Vollständige Prüfung eines Haikus: Struktur (lib/shared/haiku.ts) und Silben.
 * `ok` ist nur true, wenn beides sitzt und jede Zeile sicher gezählt werden konnte.
 *
 * @param {unknown} text
 * @param {Map<string, number|null>} [espeakMap]
 * @returns {HaikuBefund}
 */
export function checkHaiku(text, espeakMap) {
  const issues = checkHaikuStructure(text).map((i) => ({ ...i, kind: 'struktur' }));
  const lines = typeof text === 'string' ? splitHaiku(text.trim()) : null;
  const counts = [];
  const unclear = [];

  if (lines) {
    lines.forEach((line, i) => {
      const measured = wordsOf(line).map((w) => countWord(w, espeakMap));
      const bad = measured.filter((m) => m.count === null);
      unclear.push(...bad);
      if (bad.length > 0) {
        counts.push(null);
        issues.push({
          kind: 'silben',
          code: 'unklar',
          line: i + 1,
          message: `Zeile ${i + 1}: Silbenzahl nicht sicher bestimmbar für ${bad
            .map((b) => `${b.word} (Regel ${b.votes.regel}, hypher ${b.votes.hypher}, espeak ${b.votes.espeak ?? '?'})`)
            .join(', ')}.`,
        });
        return;
      }
      const total = measured.reduce((s, m) => s + m.count, 0);
      counts.push(total);
      if (total !== HAIKU_PATTERN[i]) {
        issues.push({
          kind: 'silben',
          code: 'silbenzahl',
          line: i + 1,
          message: `Zeile ${i + 1} hat ${total} Silben statt ${HAIKU_PATTERN[i]}: ${measured
            .map((m) => `${m.word}=${m.count}`)
            .join(' ')}`,
        });
      }
    });
  }

  return { text, ok: issues.length === 0, issues, counts, unclear };
}

/**
 * Der Einstieg für Aufrufer: prüft eine Liste Haikus und phonemisiert dafür alle
 * vorkommenden Wörter in einem Rutsch.
 *
 * @param {unknown[]} texts
 * @returns {Promise<HaikuBefund[]>}
 */
export async function checkHaikus(texts) {
  const vocabulary = [
    ...new Set(
      texts.flatMap((t) => {
        const lines = typeof t === 'string' ? splitHaiku(t.trim()) : null;
        return lines ? lines.flatMap(wordsOf) : [];
      }),
    ),
  ];
  const espeakMap = vocabulary.length > 0 ? await espeakCounts(vocabulary) : new Map();
  return texts.map((t) => checkHaiku(t, espeakMap));
}

/** Wörter, die das Lexikon kennt — für Tests und das Audit-Skript. */
export const lexiconSize = () => Object.keys(LEXICON.words).length;
