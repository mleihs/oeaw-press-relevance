// Prompt des Lektorats. Getrennt von lektorat.ts, damit der Text an einer
// Stelle steht und ohne Modellaufruf getestet werden kann.
//
// Maßstab ist die Rubrik, nach der die Texte entstanden sind (dieselben
// Bausteine aus lib/server/analysis/prompts.ts bzw. lib/server/events/prompts.ts),
// dazu die Regeln, die beim In-Chat-Bewerten von Hand galten (Memory
// inchat-scoring-sprachqualitaet): Satzbau, kein unklares „Es", keine
// Rückfall-Floskeln, keine gleichen Schlüsse quer über den Stapel, gemischte
// Winkel-Formen. Nie der Bestand als Vorbild.

import { PUBLICATION_TEXT_RULES, TYPOGRAPHY_RULES } from '@/lib/server/analysis/prompts';
import { EVENT_TEXT_RULES, EVENT_TYPOGRAPHY_RULES } from '@/lib/server/events/prompts';
import { TEXT_FIELDS, type AuditCode, type AuditEntity, type AuditFinding, type TextField } from '@/lib/shared/scoring/text-audit';
import type { RunMemory } from './lektorat';

/**
 * Techniken gegen den Gedankenstrich, aus docs/writing-style.md übernommen
 * (dort für UI-Texte, hier mit Beispielen aus Pressetexten).
 */
export const DASH_TECHNIQUES = `Gedankenstriche (—, auch – mit Leerzeichen) sind verboten. Ersetze sie nicht einfach durch ein Komma, das lässt den Gedanken halbiert stehen. Baue den Satz um:
- Qualifier voranstellen: „Die Funde sind — so das Team — älter als gedacht." wird „Nach Angaben des Teams sind die Funde älter als gedacht."
- Satz teilen: „Die Studie zeigt einen klaren Trend — Hitzetage nehmen zu." wird „Die Studie zeigt einen klaren Trend: Hitzetage nehmen zu." oder zwei Sätze.
- Apposition auflösen: „Der Fund — eine Bronzefibel aus dem 7. Jahrhundert — lag in einem Kindergrab." wird „Die Bronzefibel aus dem 7. Jahrhundert lag in einem Kindergrab."`;

/** Regeln, die für beide Entitäten gelten. */
export const LEKTORAT_RULES = `WAS DU TUST
- Lies jeden Text ganz, auch wenn die maschinelle Prüfung nichts gemeldet hat. Die Befunde sind Hinweise, nicht die Grenze deines Auftrags.
- Satzbau: hölzerne Nominalketten auflösen (Verben statt Substantivketten), überlange Einstiegssätze teilen, Schachtelsätze entwirren.
- Satzanfänge: kein unklares „Es" („Es zeigt sich", „Es geht um"). Nenne das Subjekt.
- Wiederholungen: Dasselbe Wort oder derselbe Gedanke zweimal in einem Text wird gestrichen oder ersetzt. Dieselbe Wortfolge in mehreren Texten des Stapels wird variiert.
- Schlüsse: Kein Text eines Feldes endet mit derselben Wendung (den letzten zwei Wörtern des letzten Satzes) wie ein anderer Text desselben Feldes im Stapel oder wie eine Wendung der Sperrliste. Der letzte Satz gehört der Sache oder ihrer Konsequenz.
- Rückfall-Floskeln vermeiden: „aktueller Anlass", „für Laien", „breites Publikum", „bleibt abstrakt", „schwer zu vermitteln", „ein Thema für", „verlangt Erklärung", „erschien bereits im". Sag stattdessen, was an der Sache konkret anschlussfähig oder sperrig ist.
- Winkel (suggested_angle): Formen mischen. Aussage, Frage und die Form „Stichwort: Satz" wechseln sich ab; die Doppelpunkt-Form steht höchstens bei jedem zweiten Winkel.
- Verankerung: Konkretes (Institut, Forschende, Publikationsorgan, Fachbegriff mit Erklärung, Größenordnung) bleibt stehen. Gibt der Quelltext einen Anker her, der im Text fehlt, darf er hinein.
- Personen: Nennt der Quelltext für eine Person kein Pronomen, schreibe neutral (Namen wiederholen, „die Forschenden", „das Team"). Leite nie ein Pronomen aus einem Vornamen ab.
- Umlaute: immer ä, ö, ü, ß, nie ae, oe, ue oder ss als Ersatz.

GEDANKENSTRICHE
${DASH_TECHNIQUES}

WAS DU NICHT TUST
- Keine Fakten, Zahlen, Namen, Orte oder Wertungen hinzufügen, die weder im Quelltext noch im bisherigen Text stehen.
- Keine Scores und kein Haiku: beides ist nicht Teil deines Auftrags.
- Die Länge nicht aufblähen: ein Text wird höchstens wenig länger, nie doppelt so lang. Die Satzzahlen der Rubrik gelten weiter.
- target_audience bleibt eine kommagetrennte Liste.
- Kein Wort über Peer-Review-Status, über die Selbstmarkierung des Instituts („pressetauglich markiert", „Highlight des Instituts") oder über Variablennamen.
- Gute Texte lässt du stehen. Ändere, wo es den Text besser macht, nicht um zu ändern.

ANTWORT
Ausschließlich gültiges JSON in diesem Format, nur mit geänderten Feldern; unveränderte Texte und Felder lässt du weg:
{"changes":[{"nr":1,"pitch_suggestion":"...","suggested_angle":"..."}]}
Ist nichts zu verbessern: {"changes":[]}`;

const SYSTEM_PROMPTS: Record<AuditEntity, string> = {
  publications: `Du bist Lektor:in der Pressestelle der Österreichischen Akademie der Wissenschaften (ÖAW). Ein Modell hat zu jeder Publikation vier Texte für die Pressearbeit geschrieben. Du lektorierst sie, bevor sie gespeichert werden: Satzbau, Rhythmus, Konkretheit und Verankerung verbessern, Floskeln und Wiederholungen quer über den ganzen Stapel tilgen. Du bewertest nicht neu und erfindest nichts.

MASSSTAB ist die Rubrik, nach der die Texte entstanden sind, nicht der Durchschnitt früherer Texte:

${PUBLICATION_TEXT_RULES}

Typografie: ${TYPOGRAPHY_RULES}

${LEKTORAT_RULES}`,
  events: `Du bist Lektor:in im Veranstaltungsbüro der Österreichischen Akademie der Wissenschaften (ÖAW). Ein Modell hat zu jeder Veranstaltung vier Texte für die Veranstaltungsseite und die Pressearbeit geschrieben. Du lektorierst sie, bevor sie gespeichert werden: Satzbau, Rhythmus und Konkretheit verbessern, Floskeln und Wiederholungen quer über den ganzen Stapel tilgen. Du bewertest nicht neu und erfindest nichts.

MASSSTAB ist die Rubrik, nach der die Texte entstanden sind, nicht der Durchschnitt früherer Texte:

${EVENT_TEXT_RULES}

Typografie: ${EVENT_TYPOGRAPHY_RULES}

${LEKTORAT_RULES}`,
};

export function buildLektoratSystemPrompt(entity: AuditEntity): string {
  return SYSTEM_PROMPTS[entity];
}

/** Lesbare Namen der Befund-Codes für den Lektor. */
const CODE_LABEL: Record<AuditCode, string> = {
  leak: 'Metadaten im Text',
  em_dash: 'Gedankenstrich',
  umlaut_digraph: 'ae/oe/ue statt Umlaut',
  filler: 'Verwertbarkeits-Floskel',
  fallback_phrase: 'Rückfall-Floskel',
  pitch_length: 'Pitch-Länge',
  es_start: 'Satzanfänge mit „Es"',
  closing_bigram_dup: 'gleicher Schluss wie andere Texte',
  trigram_rep: 'wiederkehrende Wortfolge',
  angle_form_monotony: 'gleichförmige Winkel',
};

const ANGLE_FORM_LABEL = { aussage: 'als Aussage', frage: 'als Frage', doppelpunkt: 'in der Form „Stichwort: Satz"' } as const;

export interface LektoratPromptItem {
  title: string;
  content: string;
  texts: Record<TextField, string>;
  findings: AuditFinding[];
}

/** User-Prompt eines Stapels: Sperrliste aus früheren Stapeln, dann die Texte mit Befunden. */
export function buildLektoratUserPrompt(entity: AuditEntity, items: LektoratPromptItem[], memory: RunMemory): string {
  const noun = entity === 'publications' ? 'Publikationen' : 'Veranstaltungen';
  const blocked = TEXT_FIELDS.flatMap((field) => {
    const list = memory.closings[field] ?? [];
    return list.length > 0 ? [`- ${field}: ${list.map((c) => `„${c}"`).join(', ')}`] : [];
  });
  const forms = Object.entries(memory.angleForms)
    .filter(([, n]) => n > 0)
    .map(([form, n]) => `${n} ${ANGLE_FORM_LABEL[form as keyof typeof ANGLE_FORM_LABEL]}`);

  const head =
    blocked.length > 0 || forms.length > 0
      ? [
          'SPERRLISTE: Schlusswendungen, die frühere Stapel dieses Laufs schon verwenden. Kein Text desselben Feldes darf so enden:',
          ...blocked,
          ...(forms.length > 0 ? [`Winkel bisher in diesem Lauf: ${forms.join(', ')}.`] : []),
        ].join('\n')
      : 'Dies ist der erste Stapel des Laufs; eine Sperrliste gibt es noch nicht.';

  const blocks = items.map((item, i) => {
    const findings =
      item.findings.length > 0
        ? item.findings.map((f) => `- ${f.field}, ${CODE_LABEL[f.code]}: ${f.detail}`).join('\n')
        : '- keine';
    return `=== Text ${i + 1} ===
Titel: ${item.title}
Quelltext: ${item.content}
${TEXT_FIELDS.map((f) => `${f}: ${item.texts[f]}`).join('\n')}
Maschinelle Befunde:
${findings}`;
  });

  return `Stapel mit ${items.length} ${noun}. Lektoriere alle Texte; antworte mit "nr" = Nummer des Textes.

${head}

${blocks.join('\n\n')}`;
}
