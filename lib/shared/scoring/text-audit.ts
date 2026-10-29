// Maschinelles Text-Audit der Bewertungsfelder. Rein, ohne Abhängigkeiten.
//
// Zwei Ebenen:
//   auditItem   Befunde, die an EINEM Datensatz hängen (Leak, Gedankenstrich,
//               Umlaut-Ersatz, Floskeln, Pitch-Länge, Satzanfänge mit „Es").
//   auditBatch  Befunde, die erst über einen Chunk sichtbar werden: gleiche
//               Schlusswendungen, wiederkehrende Wortfolgen, gleichförmige Winkel.
//               Das ist die Monotonie, die beim In-Chat-Bewerten von Hand
//               auffiel (Memory inchat-scoring-sprachqualitaet) und die keine
//               Einzelprüfung sehen kann.
//
// Das Audit entscheidet nichts. Was ein Befund auslöst, legt der Aufrufer fest:
// das CLI bricht bei `leak` ab, der Bewertungskern reicht die Befunde ans
// Lektorat weiter und zählt, was danach übrig bleibt. Die Schwellen sind
// exportiert, damit der Vergleichslauf (Plan §6) sie an einer Stelle justiert.

import { isUmlautDigraphWord } from '../haiku';
import type { ScoringEntity } from './entity';

export const TEXT_FIELDS = ['pitch_suggestion', 'suggested_angle', 'reasoning', 'target_audience'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const AUDIT_CODES = [
  'leak',
  'em_dash',
  'umlaut_digraph',
  'filler',
  'fallback_phrase',
  'pitch_length',
  'es_start',
  'closing_bigram_dup',
  'trigram_rep',
  'angle_form_monotony',
] as const;
export type AuditCode = (typeof AUDIT_CODES)[number];

export type AuditEntity = ScoringEntity;

export interface AuditFinding {
  id: string;
  field: TextField;
  code: AuditCode;
  /** Deutsch, die Fundstelle oder Zahl, für Log und Lektorats-Prompt. */
  detail: string;
}

/**
 * Was das Modell über den Eintrag las. Was wörtlich darin steht, ist Material,
 * kein Fehler des Textes: „Boehringer" oder „Coelho" ist kein Umlaut-Ersatz,
 * „Institut für Molekulare Biotechnologie" in drei IMBA-Pitches keine Floskel
 * (beides Fehlalarme der ersten Nacht, 2026-10-29).
 */
export interface AuditSource {
  /** Titel und Quelltext. */
  text: string;
  /** Eigennamen aus den Kopfzeilen: Personen, Institute, Veranstalter, Ort. */
  names: readonly string[];
}

export interface AuditItem {
  id: string;
  texts: Partial<Record<TextField, string | null | undefined>>;
  /** Ohne Quelle prüft das Audit ohne Ausnahmen (ältere Aufrufer, Tests). */
  source?: AuditSource;
}

export interface AuditOptions {
  entity: AuditEntity;
}

/** Erlaubte Pitch-Länge in Zeichen. Pubs: der kürzeste Bestands-Pitch hat 114
 *  Zeichen, alles darunter ist ein Fragment; der längste liegt bei knapp 900.
 *  Events sind Ankündigungen und deshalb kürzer. */
export const PITCH_LENGTH: Record<AuditEntity, { min: number; max: number }> = {
  publications: { min: 110, max: 1200 },
  events: { min: 60, max: 700 },
};

/** Ab so vielen Datensätzen eines Chunks gilt dasselbe Schluss-Bigramm als Dublette. */
export const CLOSING_BIGRAM_MIN_ITEMS = 2;
/** Ab so vielen Datensätzen gilt eine Wortfolge aus drei Wörtern als Wiederholung. */
export const TRIGRAM_MIN_ITEMS = 3;
/** Winkel der Form „Stichwort: Satz" ab diesem Anteil, und erst ab so vielen Winkeln. */
export const ANGLE_FORM_MAX_SHARE = 0.5;
export const ANGLE_FORM_MIN_ITEMS = 5;

// ---------------------------------------------------------------------------
// Regeln je Datensatz
// ---------------------------------------------------------------------------

/** Variablennamen und Eingabe-Flags, die nie im Text auftauchen dürfen: sie
 *  verraten, dass das Modell aus den Metadaten statt aus dem Inhalt schließt. */
const LEAK_VARIABLE = /(popular_science|peer_reviewed|mahighlight)\s*=/i;
const LEAK_FLAG_PROSE = /peer-?reviewed|pressetauglich markiert|Highlight des Instituts/i;
/**
 * Der Bewertungsvorgang selbst. Die Felder beschreiben die Sache, nicht ihre
 * Bewertung: keine Einstufung, kein Bereich der Kalibrierung, keine Werte, kein
 * Vergleich mit einer anderen Fassung oder einem früheren Durchgang. Die Rubrik
 * verbietet das (EVENT_TEXT_RULES, PUBLICATION_TEXT_RULES), das Lektorat tilgt
 * es; diese Muster sind das Netz dahinter.
 *
 * Seit 2026-10-28 für die Zwillingsübernahme, am 2026-10-29 verbreitert, als die
 * erste Nacht zeigte, dass die Event-Begründungen die Bereiche der Kalibrierung
 * nacherzählten („zählt damit zu den Fachvorträgen im engen Kreis"). Gemessen am
 * ganzen Prod-Bestand (520 Events, 8476 Publikationen): jedes Muster trifft dort
 * nur Prozess-Sätze. Was bei Publikationen auch Inhalt sein kann („als
 * chancenarm eingestuft", „die englische Fassung des Dossiers", das
 * Kalium-Dublett), steht nur in der Event-Liste; Werte allein sind bei
 * Publikationen Messwerte („die höchsten Werte tragen die kalten Seen").
 */
const LEAK_PROCESS_SHARED: readonly RegExp[] = [
  /\b(?:bereits|schon) (?:[\p{L}\p{N}.,]+ ){0,3}(?:bewertet|eingestuft)\p{L}*/iu,
  /\b(?:dieselbe|gleiche|identische) (?:Einstufung|Bewertung|Einschätzung)\b/iu,
  /\b(?:Einstufung|Bewertung)(?: \p{L}+){0,2} (?:entspricht|beruht|basiert|stützt|folgt|bleibt|fällt|liegt|orientiert|ergibt)\b/iu,
  /\b(?:bleibt|ist) die (?:Einstufung|Bewertung) (?:identisch|gleich|dieselbe)\b|\b(?:Einstufung|Bewertung) unver(?:ä|ae)ndert\b/iu,
  /\b(?:gleich|identisch|ebenso|genauso|bewusst(?: \p{L}+)?) (?:eingestuft|bewertet)\b/iu,
  /(?:^|[.!?]\s+)Bewertet wird\b/u,
  /\b(?:eine|die) (?:inhaltliche |fundierte |belastbare )?Bewertung (?:w(?:ä|ae)re|darauf)\b|\bBewertung (?:\p{L}+ )?einschr(?:ä|ae)nkt\b/iu,
  /\b(?:höchste[rn]?|niedrigste[rn]?|beste[rn]?) (?:Score|Bewertung)\b|\b(?:Novelty|Storytelling|Relevanz|Relevance|Timeliness|Accessibility)-Score\b|\b(?:im|in diesem|im vorigen|in dieser) (?:Batch|Charge|Session|Stapel)\b(?!-)|\bBatch \d+\b|\bgegen(?:ü|ue)ber dem ersten Durchgang\b/iu,
  /\bMehrfachanlage\p{L}*|\bZentralseite\b|\bdesselben Termins\b|\bBewertungspool\b|\bin den Pool\b|\bin die Bewertung zur(?:ü|ue)ck/iu,
  /\bnahe an der (?:\p{L}+ )?Bewertung\b|\bh(?:ä|ae)lt (?:\p{L}+ )?die Kalibrierung\b/iu,
];
const LEAK_PROCESS: Record<AuditEntity, readonly RegExp[]> = {
  publications: LEAK_PROCESS_SHARED,
  events: [
    ...LEAK_PROCESS_SHARED,
    /\b(?:eingestuft|einzustufen|einstufen|Einstufung\p{L}*)\b|\bDublett\p{L}*/iu,
    /\bWerte(?: \p{L}+){0,2} (?:entsprechen|liegen|ergeben|folgen|bleiben)\b/iu,
    // Die Bereiche aus EVENT_CALIBRATION, nacherzählt.
    /Fachvortr\p{L}* im engen Kreis|Flaggschiff-?Bereich|\b(?:im|in den|zum) (?:unteren|oberen|mittleren) Bereich\b|\bBereich (?:der|interner|technischer|öffentlicher) (?:\p{L}+ )?(?:Seminar|Fachseminar|Fachveranstaltung|Veranstaltung|Vortr|Workshop|Kolloqui|Konferenz|Flaggschiff)\p{L}*/iu,
    // Die andere Fassung desselben Termins (EVENT_TWIN_RULE).
    /\b(?:deutsch|englisch)(?:sprachig)?e[nr]? (?:Sprach)?fassung\b|\bSprachfassung\p{L}*|\bandere[n]? (?:\p{L}+ )?Fassung\b/iu,
    /\bdenselben (?:Termin|Vortrag|Workshop|Kongress|Abend) wie\b|\b(?:zweite|dritte) (?:Seite|Eintragung|Anlage)\b/iu,
    /\b(?:niedrig|hoch|höher|niedriger|zurückhaltend)(?:er)? (?:bewertet|eingestuft)\b|\b(?:niedrige|mittlere|hohe|höhere|zurückhaltende) Bewertung\b/iu,
  ],
};
const LEAK_FIELDS: readonly TextField[] = ['reasoning', 'pitch_suggestion', 'suggested_angle'];

/** Gedankenstrich: Em-Dash überall, En-Dash nur mit Leerzeichen beidseitig
 *  (als Bis-Strich ohne Leerzeichen, „1975–1980", ist er korrekt). */
const EM_DASH = /—| – /;

/** Verwertbarkeits-Floskeln im Pitch, genau die, die die Rubrik verbietet. Der
 *  Guard hängt am VOKABULAR der Verwertbarkeit, nicht an einer Satzform:
 *  „eignet sich für" allein wäre zu eng und zugleich zu breit, weil „das
 *  Verfahren eignet sich zur Diagnostik" legitime Substanz ist. Medienbegriffe
 *  und Standort-Rhetorik trennen das sauber. Umlaut-tolerant, falls ein Text in
 *  ue/ae-Schreibweise ankommt. */
const FILLER =
  /dankbar(es)?\s|wertvoll(er|es)\s+(Baustein|Beitrag)|macht\s+den\s+Standort|Standort\s+sichtbar|Bildstrecke|Magazingeschichte|Aufmacher|Schlagzeile|f(ü|ue)r\s+ein(e)?\s+(Feature|Reportage|Berichterstattung)|eignet sich (f(ü|ue)r|als)\s+(ein|eine|einen)?\s*(Feature|Story|Beitrag|Thema)/i;

/** Ausweichformeln: Sätze, die nichts über die Sache sagen, sondern über ihre
 *  Vermittelbarkeit. In allen Feldern. */
const FALLBACK_PHRASE =
  /aktuellen? Anlass|f(ü|ue)r Laien|breites Publikum|bleibt .{0,20}(abstrakt|speziell)|schwer zu vermitteln|ein Thema f(ü|ue)r|verlangt Erkl(ä|ae)rung|erschien bereits im/i;

const ES_START_FIELDS: readonly TextField[] = ['reasoning', 'pitch_suggestion'];

const WORD = /[\p{L}\p{N}]+/gu;
const wordsIn = (s: string): string[] => s.match(WORD) ?? [];

/** Befunde eines einzelnen Datensatzes, in Feld- und Regelreihenfolge. */
export function auditItem(item: AuditItem, opts: AuditOptions): AuditFinding[] {
  const out: AuditFinding[] = [];
  const add = (field: TextField, code: AuditCode, detail: string) =>
    out.push({ id: item.id, field, code, detail });
  const exempt = sourceExemptions(item.source);

  for (const field of TEXT_FIELDS) {
    const text = item.texts[field];
    if (typeof text !== 'string') continue;

    if (LEAK_FIELDS.includes(field)) {
      const leak =
        LEAK_VARIABLE.exec(text) ??
        LEAK_FLAG_PROSE.exec(text) ??
        LEAK_PROCESS[opts.entity].reduce<RegExpExecArray | null>((hit, re) => hit ?? re.exec(text), null);
      if (leak) add(field, 'leak', leak[0].trim());
    }

    const dash = EM_DASH.exec(text);
    if (dash) add(field, 'em_dash', `„${context(text, dash.index)}"`);

    const digraph = wordsIn(text).find((w) => isUmlautDigraphWord(w) && !exempt.words.has(w.toLowerCase()));
    if (digraph) add(field, 'umlaut_digraph', digraph);

    if (field === 'pitch_suggestion' && opts.entity === 'publications') {
      const filler = FILLER.exec(text);
      if (filler) add(field, 'filler', filler[0]);
    }

    const fallback = FALLBACK_PHRASE.exec(text);
    if (fallback) add(field, 'fallback_phrase', fallback[0]);

    if (field === 'pitch_suggestion') {
      const { min, max } = PITCH_LENGTH[opts.entity];
      const len = text.trim().length;
      if (len < min || len > max) add(field, 'pitch_length', `${len} Zeichen (erlaubt ${min} bis ${max})`);
    }

    if (ES_START_FIELDS.includes(field)) {
      const esStarts = splitSentences(text).filter((s) => /^Es\s/.test(s)).length;
      if (esStarts > 1) add(field, 'es_start', `${esStarts} Sätze beginnen mit „Es"`);
    }
  }
  return out;
}

/** Wörter mit vier und mehr Buchstaben, die in Eigennamen nur Füllung sind. */
const NAME_FILLERS = new Set(['einer', 'eines', 'einem', 'sowie', 'über', 'unter', 'durch', 'with', 'from']);

interface SourceExemptions {
  /** Alle Wörter der Quelle, klein: so geschrieben, wie die Quelle sie schreibt. */
  words: ReadonlySet<string>;
  /** Wörter der Eigennamen: eine Dreierfolge damit ist Verankerung wie ANCHOR_WORDS. */
  nameWords: ReadonlySet<string>;
  /** Dreierfolgen, die wörtlich in der Quelle stehen. */
  trigrams: ReadonlySet<string>;
}

const NO_EXEMPTIONS: SourceExemptions = { words: new Set(), nameWords: new Set(), trigrams: new Set() };

function sourceExemptions(source: AuditSource | undefined): SourceExemptions {
  if (!source) return NO_EXEMPTIONS;
  const all = [source.text, ...source.names].join('\n').toLowerCase();
  const nameWords = new Set(
    source.names.flatMap((n) => wordsIn(n.toLowerCase())).filter((w) => w.length >= 4 && !NAME_FILLERS.has(w)),
  );
  const trigrams = new Set<string>();
  for (const part of [source.text, ...source.names]) {
    const words = wordsIn(part.toLowerCase());
    for (let i = 0; i + 2 < words.length; i++) trigrams.add(words.slice(i, i + 3).join(' '));
  }
  return { words: new Set(wordsIn(all)), nameWords, trigrams };
}

/** Ausschnitt um eine Fundstelle, für lesbare Befunde. */
function context(text: string, index: number): string {
  return text.slice(Math.max(0, index - 25), index + 25).trim();
}

// ---------------------------------------------------------------------------
// Regeln über den Chunk
// ---------------------------------------------------------------------------

/** Felder mit Fließtext. `target_audience` ist eine Aufzählung von Ressorts;
 *  dort wiederholen sich Wortfolgen und Schlüsse zwangsläufig, das ist keine
 *  Monotonie. */
export const CHUNK_FIELDS: readonly TextField[] = ['pitch_suggestion', 'reasoning', 'suggested_angle'];

/** Wortfolgen, deren Wiederkehr die Rubrik VERLANGT: Pitches sollen Institut
 *  und Akademie benennen (prompts.ts, Punkt 6, VERANKERUNG). Eine Dreierfolge
 *  mit einem dieser Wörter ist Verankerung, nicht Floskel. */
const ANCHOR_WORDS = new Set([
  'akademie', 'wissenschaften', 'österreichischen', 'österreichische', 'öaw', 'oeaw', 'institut', 'instituts',
]);

/** Winkel in der Form „Stichwort: Satz". Exportiert für das Laufgedächtnis des
 *  Lektorats (lib/server/scoring/lektorat.ts), das die Formen über Chunks zählt. */
export const ANGLE_COLON_FORM = /^[^:]{2,40}:\s/;

/**
 * Befunde, die erst über mehrere Datensätze sichtbar werden. Liefert NUR diese;
 * die Befunde je Datensatz kommen aus auditItem. Jeder betroffene Datensatz
 * bekommt einen eigenen Befund, damit das Lektorat weiß, wo es ansetzen muss.
 */
export function auditBatch(items: AuditItem[], _opts: AuditOptions): AuditFinding[] {
  const out: AuditFinding[] = [];
  const exemptions = new Map(items.map((it) => [it.id, sourceExemptions(it.source)]));
  const exemptOf = (it: AuditItem): SourceExemptions => exemptions.get(it.id) ?? NO_EXEMPTIONS;

  for (const field of CHUNK_FIELDS) {
    const present = items.flatMap((it) => {
      const text = it.texts[field];
      return typeof text === 'string' && text.trim() !== '' ? [{ id: it.id, text, exempt: exemptOf(it) }] : [];
    });

    // Gleiches Schluss-Bigramm im letzten Satz.
    const byClosing = idsByKey(present, (text) => {
      const last = splitSentences(text).at(-1);
      return last === undefined ? null : closingBigram(last);
    });
    for (const [bigram, ids] of byClosing) {
      if (ids.length < CLOSING_BIGRAM_MIN_ITEMS) continue;
      for (const id of ids) {
        out.push({ id, field, code: 'closing_bigram_dup', detail: `Schluss „… ${bigram}" in ${ids.length} Datensätzen` });
      }
    }

    // Wiederkehrende Dreierfolgen. Je Datensatz zählt eine Folge einmal.
    const byTrigram = new Map<string, string[]>();
    for (const { id, text, exempt } of present) {
      for (const tri of trigramsOf(text, exempt)) {
        const ids = byTrigram.get(tri) ?? [];
        ids.push(id);
        byTrigram.set(tri, ids);
      }
    }
    for (const [tri, ids] of byTrigram) {
      if (ids.length < TRIGRAM_MIN_ITEMS) continue;
      for (const id of ids) {
        out.push({ id, field, code: 'trigram_rep', detail: `„${tri}" in ${ids.length} Datensätzen` });
      }
    }
  }

  // Gleichförmige Winkel: „Stichwort: Satz" als Schablone.
  const angles = items.flatMap((it) => {
    const text = it.texts.suggested_angle;
    return typeof text === 'string' && text.trim() !== '' ? [{ id: it.id, text: text.trim() }] : [];
  });
  const colonForm = angles.filter(({ text }) => ANGLE_COLON_FORM.test(text));
  if (angles.length >= ANGLE_FORM_MIN_ITEMS && colonForm.length / angles.length > ANGLE_FORM_MAX_SHARE) {
    for (const { id } of colonForm) {
      out.push({
        id,
        field: 'suggested_angle',
        code: 'angle_form_monotony',
        detail: `${colonForm.length} von ${angles.length} Winkeln in der Form „Stichwort: Satz"`,
      });
    }
  }

  return out;
}

function idsByKey(
  rows: Array<{ id: string; text: string }>,
  keyOf: (text: string) => string | null,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { id, text } of rows) {
    const key = keyOf(text);
    if (key !== null) map.set(key, [...(map.get(key) ?? []), id]);
  }
  return map;
}

/** Eindeutige Wort-Dreierfolgen eines Textes, klein geschrieben, ohne Verankerung
 *  und ohne Folgen, die der Eintrag aus seiner eigenen Quelle übernimmt. */
function trigramsOf(text: string, exempt: SourceExemptions): Set<string> {
  const words = wordsIn(text.toLowerCase());
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) {
    const tri = words.slice(i, i + 3);
    if (tri.some((w) => ANCHOR_WORDS.has(w) || exempt.nameWords.has(w))) continue;
    const key = tri.join(' ');
    if (!exempt.trigrams.has(key)) out.add(key);
  }
  return out;
}

/** Ausgezählte Befunde je Code, alle Codes vorhanden (für Journal und Bericht). */
export function countFindings(findings: AuditFinding[]): Record<AuditCode, number> {
  const counts = Object.fromEntries(AUDIT_CODES.map((c) => [c, 0])) as Record<AuditCode, number>;
  for (const f of findings) counts[f.code]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Sätze
// ---------------------------------------------------------------------------

/** Abkürzungen, nach deren Punkt kein Satz endet (klein, ohne Punkt). Einzelne
 *  Buchstaben (z. B., Initialen) und Ordinalzahlen fängt splitSentences selbst. */
const ABBREVIATIONS = new Set([
  'dr', 'prof', 'bzw', 'ca', 'vgl', 'etc', 'nr', 'usw', 'jh', 'jhd', 'mio', 'mrd', 'inkl', 'evtl', 'ggf',
  'sog', 'st', 'hl', 'mag', 'dipl', 'ing', 'univ', 'abs', 'bd', 'hrsg', 'hg', 'kap', 'ff', 'al', 'ebd',
  'geb', 'chr', 'bspw', 'insb', 'bzgl', 'gem', 'mind', 'rd', 'vs', 'phil', 'med', 'rer', 'nat', 'habil',
]);

/** Endet `chunk` auf einen Punkt, der keinen Satz beendet? */
function endsOnNonTerminalDot(chunk: string): boolean {
  if (!chunk.endsWith('.')) return false;
  const token = (chunk.split(/\s+/).pop() ?? '').slice(0, -1).replace(/^[(„"»‚']+/, '');
  if (token === '') return false;
  if (token.includes('.')) return true; // z.B., u.a., e.V.
  if (/^\d{1,3}$/.test(token)) return true; // 16. Jahrhundert, 3. März; Jahreszahlen enden Sätze
  if (/^[IVXLCDM]+$/.test(token)) return true; // XXII. Parteitag, Pius XII.
  if (/^\p{L}$/u.test(token)) return true; // z. B., J. Smith
  return ABBREVIATIONS.has(token.toLowerCase());
}

/**
 * Sätze eines Textes. Ordinal- und abkürzungssicher: „XXII.", „16. Jahrhundert",
 * „z. B." und „Dr." beenden keinen Satz, ein klein weitergeführter Text auch nicht.
 */
export function splitSentences(text: string): string[] {
  const parts = text.trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  parts.forEach((part, i) => {
    current = current ? `${current} ${part}` : part;
    const next = parts[i + 1];
    const continues = next !== undefined && (endsOnNonTerminalDot(current) || /^\p{Ll}/u.test(next));
    if (!continues) {
      out.push(current);
      current = '';
    }
  });
  return out;
}

/** Die letzten zwei Wörter eines Satzes, klein geschrieben; null bei weniger als zwei. */
export function closingBigram(sentence: string): string | null {
  const words = wordsIn(sentence.toLowerCase());
  return words.length >= 2 ? words.slice(-2).join(' ') : null;
}
