// Silbenzählung für das Haiku-Gate: Regelzähler, Lexikon, Abstimmung. Rein und
// ohne Abhängigkeiten, deshalb auch im Bewertungskern der App benutzbar.
//
// WARUM DREI ZÄHLER, UND WARUM HIER NUR EINER. Für Deutsch gibt es keinen
// fertigen Validator, und Silbentrennung ist keine Silbenzählung: TeX-Muster
// (hypher) lassen kurze Wortanfänge ungetrennt, weshalb `über`, `Atem`, `oder`,
// `Ecke` dort einsilbig sind. Gemessen an 147 handgezählten Zeilen:
//
//   Regelzähler        146/147   99,3 %   blind bei Lehnwörtern (Code, Team)
//   espeak-ng (IPA)    143/147   97,3 %   blind bei -tion, Lücken in der IPA-Tabelle
//   hypher (TeX)       138/147   93,9 %   blind bei kurzen Wörtern
//
// Die Fehler liegen an verschiedenen Stellen, deshalb entscheidet im CLI die
// Mehrheit. espeak-ng (18,7 MB WASM, GPL-3.0) und hypher gehören aber nicht ins
// Next-Bundle; sie bleiben in scripts/lib/haiku-syllables.mjs und kommen als
// `extraVotes` herein. Ohne sie zählt die Regel allein, abgesichert durch das
// Lexikon und die Liste `_unsicher` der Lehnwörter, bei denen sie bekannt
// danebenliegt. Die Fixture __fixtures__/haikus-147.json belegt, dass das trägt.
//
// FAIL CLOSED. Wo keine sichere Zahl zustande kommt, liefert das Modul kein
// Ergebnis, sondern meldet das Wort als unklar, und das Haiku fällt durch.
// Lieber ein Lexikoneintrag zu viel als ein ungeprüftes Haiku in der Datenbank.
// Das Lexikon (haiku-lexicon.json) schlägt jeden Zähler.

import { HAIKU_PATTERN, checkHaikuStructure, splitHaiku, type HaikuIssue } from '../haiku';
import LEXICON from './haiku-lexicon.json';

const LEXICON_WORDS: Record<string, number> = LEXICON.words;
const UNSICHER = new Set<string>(LEXICON._unsicher);

// ---------------------------------------------------------------------------
// Regelzähler: eine Silbe pro Vokalkern.
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

export function ruleCount(word: string): number {
  let w = word.toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (!w) return 0;
  // Ein einzelner Buchstabe wird als Buchstabenname gesprochen (be, ce, de …).
  if (w.length === 1) return 1;

  w = w.replace(/qu/g, 'kv'); // das u in qu ist kein Kern (Quelle = Kvel-le)

  // Präfix vor Vokal: die Grenze verhindert, dass ge+ehrt als Doppelvokal
  // durchgeht (geehrt = ge-ehrt, nicht gehrt). Vor `i` und `u` gilt sie nur bei
  // den Stämmen, die wirklich so anfangen (ge-impft, be-irrt, be-in-hal-ten,
  // be-ur-tei-len, be-un-ru-hi-gen); sonst ist `ei`/`eu` der Diphthong des
  // Wortes selbst (bei, beide, Geist, Beute). Gefunden 2026-10-27, als die Regel
  // für den Bewertungskern zum ersten Mal ohne die beiden anderen Zähler lief:
  // `bei` kam auf 2.
  w = w.replace(
    new RegExp(`^(ge|be)([aeoäöüy]|i(?=mpf|rr|nhalt)|u(?=rt|rl|rk|nr))`),
    `$1${HIATUS}$2`,
  );

  // Dehnungs-h zwischen zwei Vokalen trennt (Ehe, Reihe, gehen); stummes h nach
  // Vokal vor Konsonant dehnt nur und verschwindet (sehr, Mehl).
  w = w.replace(new RegExp(`([${VOWELS}])h([${VOWELS}])`, 'g'), `$1${HIATUS}$2`);
  w = w.replace(new RegExp(`([${VOWELS}])h`, 'g'), '$1');

  // Wortausgänge, in denen die Vokalfolge entgegen der Grundregel auseinanderfällt.
  // Linien, Medien, Bakterien. Die Vorbedingung „irgendwo vorher ein Vokal"
  // hält einsilbige Wörter heraus, die zufällig auf -ien enden (Wien).
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
function nucleiInRun(run: string): number {
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
// Abstimmung
// ---------------------------------------------------------------------------

/** Stimme eines Zählers: Silbenzahl, oder null, wenn er sich enthält. */
export type Vote = number | null;

export interface WordCount {
  word: string;
  /** null, wenn das Wort nicht sicher zählbar ist (fail closed). */
  count: number | null;
  source: 'lexikon' | 'mehrheit' | 'regel' | 'unklar';
  /** Abgegebene Stimmen, `regel` zuerst; leer bei einem Lexikontreffer. */
  votes: Record<string, Vote>;
}

export const WORD_SPLIT = /[^\p{L}]+/u;
export const wordsOf = (line: string): string[] => line.split(WORD_SPLIT).filter(Boolean);

/**
 * Silbenzahl eines Wortes. Lexikon schlägt alles.
 *
 * Mit `extraVotes` (das CLI liefert `{hypher, espeak}`) entscheidet die
 * Mehrheit: mindestens zwei gleiche Stimmen aus Regel und Extra-Stimmen, sonst
 * unklar. Ohne Extra-Stimmen zählt die Regel allein, außer bei Wörtern, für
 * die sie nicht taugt: Lehnwörter aus `_unsicher` und alles mit Zeichen
 * außerhalb des deutschen Alphabets (Café, Señor). Die sind unklar.
 */
export function countWord(word: string, extraVotes?: Record<string, Vote>): WordCount {
  const key = word.toLowerCase();
  if (Object.hasOwn(LEXICON_WORDS, key)) {
    return { word, count: LEXICON_WORDS[key], source: 'lexikon', votes: {} };
  }
  const votes: Record<string, Vote> = { regel: ruleCount(word), ...extraVotes };

  if (extraVotes === undefined) {
    const countable = /^[a-zäöüß]+$/.test(key) && !UNSICHER.has(key);
    return countable
      ? { word, count: votes.regel, source: 'regel', votes }
      : { word, count: null, source: 'unklar', votes };
  }

  const cast = Object.values(votes).filter((v): v is number => typeof v === 'number');
  for (const value of cast) {
    if (cast.filter((v) => v === value).length >= 2) {
      return { word, count: value, source: 'mehrheit', votes };
    }
  }
  return { word, count: null, source: 'unklar', votes };
}

export interface HaikuIssueExt {
  kind: 'struktur' | 'silben';
  code: HaikuIssue['code'] | 'unklar' | 'silbenzahl';
  line?: number;
  message: string;
}

export interface HaikuBefund {
  /** Das geprüfte Haiku, unverändert. */
  text: unknown;
  /** true nur bei sauberer Struktur UND sicherem 5-7-5. */
  ok: boolean;
  issues: HaikuIssueExt[];
  /** Silben je Zeile, null wo nicht bestimmbar. */
  counts: (number | null)[];
  /** Wörter fürs Lexikon. */
  unclear: WordCount[];
}

const voteLabel = (name: string) => (name === 'regel' ? 'Regel' : name);
const describeVotes = (votes: Record<string, Vote>) =>
  Object.entries(votes)
    .map(([name, v]) => `${voteLabel(name)} ${v ?? '?'}`)
    .join(', ');

/**
 * Vollständige Prüfung eines Haikus: Struktur (lib/shared/haiku.ts) und Silben.
 * `ok` ist nur true, wenn beides sitzt und jede Zeile sicher gezählt werden
 * konnte. `extraVotesByWord` liefert je Wort die Zusatzstimmen des CLI; fehlt
 * ein Wort darin, zählt für dieses Wort die Regel allein.
 */
export function checkHaiku(text: unknown, extraVotesByWord?: Map<string, Record<string, Vote>>): HaikuBefund {
  const issues: HaikuIssueExt[] = checkHaikuStructure(text).map((i) => ({ ...i, kind: 'struktur' as const }));
  const lines = typeof text === 'string' ? splitHaiku(text.trim()) : null;
  const counts: (number | null)[] = [];
  const unclear: WordCount[] = [];

  lines?.forEach((line, i) => {
    const measured = wordsOf(line).map((w) => countWord(w, extraVotesByWord?.get(w)));
    const bad = measured.filter((m) => m.count === null);
    unclear.push(...bad);
    if (bad.length > 0) {
      counts.push(null);
      issues.push({
        kind: 'silben',
        code: 'unklar',
        line: i + 1,
        message: `Zeile ${i + 1}: Silbenzahl nicht sicher bestimmbar für ${bad
          .map((b) => `${b.word} (${describeVotes(b.votes)})`)
          .join(', ')}.`,
      });
      return;
    }
    const total = measured.reduce((s, m) => s + (m.count ?? 0), 0);
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

  return { text, ok: issues.length === 0, issues, counts, unclear };
}

/** Wörter, die das Lexikon kennt, für Tests und das Audit-Skript. */
export const lexiconSize = (): number => Object.keys(LEXICON_WORDS).length;
