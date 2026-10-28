import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildEvaluationPrompt, type PublicationForPrompt } from './prompts';

// Der gerenderte Prompt ist Teil der Kalibrierung: die Scores des Korpus sind
// gegen genau diesen Text entstanden, und der Vergleichslauf (Plan §6) misst
// die API-Bewertung gegen die In-Chat-Bewertung mit derselben Rubrik. Die
// Bausteine (PITCH_STYLE_RULES, HAIKU_RULES, TYPOGRAPHY_RULES …) werden auch
// vom Bewertungskern benutzt (Haiku-Nachforderung, Lektorat); eine Extraktion
// darf den Text deshalb um kein Zeichen verschieben. Wer die Rubrik bewusst
// ändert, aktualisiert den Snapshot und wiederholt den Vergleichslauf.

const rich = {
  title: 'Wie ein Pilz den Mais austrickst',
  original_title: 'How a smut fungus tricks maize',
  lead_author: 'Armin Djamei',
  orgunits: [
    { akronym_de: 'GMI', name_de: 'Gregor-Mendel-Institut für Molekulare Pflanzenbiologie' },
    { akronym_de: null, name_de: 'Institut für Kulturgeschichte der Antike' },
  ],
  published_at: '2026-09-14',
  peer_reviewed: true,
  popular_science: true,
  enriched_keywords: ['Mais', 'Ustilago maydis', 'Effektor', 'Cce1', 'Pflanzenimmunität', 'Pilz', 'Tumor', 'Landwirtschaft', 'Genetik', 'Ernte'],
  summary_de: 'Forschende zeigen, wie das Protein Cce1 des Maisbeulenbrand-Pilzes die Abwehr der Pflanze unterläuft.',
  summary_en: 'English summary that must not be picked.',
  enriched_abstract: null,
  abstract: 'Original abstract that must not be picked either.',
  citation: null,
} as unknown as PublicationForPrompt;

const bare = {
  title: 'Jahresbericht 2025',
  original_title: 'Jahresbericht 2025',
  lead_author: null,
  orgunits: [],
  published_at: null,
  peer_reviewed: false,
  popular_science: false,
  enriched_keywords: null,
  summary_de: '   ',
  summary_en: null,
  enriched_abstract: null,
  abstract: null,
  citation: null,
} as unknown as PublicationForPrompt;

describe('Bewertungs-Prompt der Publikationen', () => {
  it('rendert den System-Prompt unverändert', () => {
    expect(SYSTEM_PROMPT).toMatchInlineSnapshot(`"You are a senior science communication expert at the Austrian Academy of Sciences (OeAW). Your expertise is identifying which research publications would interest journalists and the general public. You work in the communications department and regularly pitch stories to Austrian media outlets (ORF, Der Standard, Die Presse, APA, Wiener Zeitung, etc.). You evaluate research for its press-worthiness based on accessibility, societal relevance, novelty, storytelling potential, and media timeliness. Form your judgment primarily from the content itself. Structured source signals (peer_reviewed, popular_science) are weak context, not endorsements — popular_science=true means the originating institute marked the publication as potentially press-relevant, but institutes apply this flag inconsistently and self-promotionally, so do not let it drive the scoring. Always respond with valid JSON only."`);
  });

  it('rendert den Bewertungs-Prompt unverändert', () => {
    expect(buildEvaluationPrompt([rich, bare])).toMatchInlineSnapshot(`
      "Bewerte die folgenden 2 wissenschaftlichen Publikationen der Österreichischen Akademie der Wissenschaften (OeAW) hinsichtlich ihres Interesses für österreichische Medien und die breite Öffentlichkeit.

      Die SCORES bildest du ausschließlich aus dem Inhalt. Das betrifft die Bewertung, nicht die Formulierung: die Kopfzeilen Autor:innen, Institut und Erschienen sind belegtes Material und gehören in den Pitch (siehe Punkt 6). Nur die Source-Signals sind reiner Kontext und dürfen weder die Scores beeinflussen noch im Output erwähnt werden:
      - popular_science=true → institutsinterne Selbstmarkierung, uneinheitlich gesetzt. Ignorieren. Nicht im reasoning, nicht in pitch_suggestion, nicht in suggested_angle erwähnen — das Flag wird in der UI ohnehin direkt aus der DB angezeigt.
      - peer_reviewed=true → ebenfalls nicht im Output erwähnen; sagt nichts über Pressetauglichkeit. Gemeint ist der Status, nicht das Publikationsorgan: geht aus dem Material hervor, wo die Arbeit erschienen ist, darfst du das Journal benennen. „Erschienen in Nature Genetics" ist ein Aufhänger, „peer-reviewed" ist eine Qualitätsbehauptung.
      - Die Inhaltsquelle „WebDB-Pressezusammenfassung (DE)" ist eine vom Institut kuratierte, nicht-technische Beschreibung — sie liefert besseres Material zur Beurteilung als ein roher Abstract, ist aber selbst kein Qualitätsbeleg (Institute schreiben sie z.T. werblich).

      Liefere für JEDE Publikation:
      1. public_accessibility (0.0-1.0): Wie leicht können Nicht-Fachleute die Forschung verstehen? Berücksichtige Fachjargon, Konzeptkomplexität und ob Erkenntnisse einfach erklärbar sind.
      2. societal_relevance (0.0-1.0): Auswirkung auf Gesundheit, Umwelt, Wirtschaft, Kultur oder Alltag. Wie direkt betrifft das Menschen?
      3. novelty_factor (0.0-1.0): Durchbruch? Stellt es bestehende Annahmen in Frage, ist es ein Paradigmenwechsel oder liefert es unerwartete Resultate?
      4. storytelling_potential (0.0-1.0): Können Journalist:innen daraus eine fesselnde Erzählung bauen? Gibt es Human-Interest-Aspekte, visuelle Elemente, lebensnahe Szenarien?
      5. media_timeliness (0.0-1.0): Anschlussfähig an aktuellen öffentlichen Diskurs, jüngste Ereignisse, Trends, saisonale Themen?

      KALIBRIERUNG AM BESTAND. Die Scores müssen mit rund achttausend bereits bewerteten Publikationen vergleichbar bleiben. Die meisten Publikationen sind Fachbeiträge für ein Fachpublikum, und die Skala bildet das ab: Im Bestand liegt der Gesamtscore im Median bei 0.26, die Hälfte zwischen 0.19 und 0.35, nur jede zehnte über 0.43; ab 0.55 stehen nur echte Pressethemen. Typische Werte je Bereich, in der Reihenfolge public_accessibility / societal_relevance / novelty_factor / storytelling_potential / media_timeliness:
      - um 0.11, hochspezialisierte Detailstudie ohne Bezug außerhalb des Fachs: 0.10 / 0.05 / 0.16 / 0.08 / 0.05
      - um 0.19, solide Facharbeit mit einem greifbaren Detail: 0.16 / 0.09 / 0.26 / 0.16 / 0.09
      - um 0.26, typischer Fachbeitrag mit vermittelbarem Kern: 0.24 / 0.12 / 0.31 / 0.27 / 0.13
      - um 0.35, gut erzählbares Thema mit mittelbarem Alltagsbezug: 0.39 / 0.22 / 0.34 / 0.39 / 0.22
      - um 0.43, starkes Thema mit klarer Relevanz und einer Erzählfigur: 0.51 / 0.30 / 0.41 / 0.49 / 0.29
      - ab 0.55, echtes Pressethema, das viele Menschen direkt betrifft, überrascht und starke Bilder liefert: 0.63 / 0.54 / 0.50 / 0.61 / 0.49
      Ordne jede Publikation zuerst einem dieser Bereiche zu und weiche nur ab, wo das Material es begründet. Leite jede Dimension aus der Arbeit selbst ab: Ein allgemeines Dauerthema (Klimawandel, Energiewende, künstliche Intelligenz, Weltraumwetter, Polarlichter, Gesundheit) hebt societal_relevance und media_timeliness nur, wenn die Arbeit selbst diesen Bezug herstellt; ein Bezug, den erst du knüpfst, zählt nicht. media_timeliness über 0.3 braucht einen konkreten Anlass: ein Ereignis, einen Jahrestag, eine laufende Debatte oder eine Saison, die das Material nennt oder die unmittelbar zum Thema gehört.

      6. pitch_suggestion: Schreibe einen 4-6-sätzigen deutschen Pitch, den ein:e Pressereferent:in beim Anpitchen an Journalist:innen verwenden kann. Inkludiere einen Aufhänger, das Hauptergebnis, warum es für die Öffentlichkeit relevant ist, und was es einzigartig oder zeitgemäß macht. Sprache zugänglich, lebendig, fachfremd.

         VERANKERUNG. Das ist der Unterschied zwischen einem Pitch und einer Inhaltsangabe. Eine Redakteurin greift zum Hörer, weil im Text etwas Konkretes steht, das sie zitieren oder nachrecherchieren kann. Nenne deshalb, was das Material hergibt, beim Namen statt in Umschreibungen:
         - Die Einrichtung: „das Gregor Mendel Institut der ÖAW", nicht „ein Forschungsteam". Institut und Autor:innen stehen oben im Datensatz. Steht beim Institut N/A, nennst du keine Einrichtung, auch keine allgemeine Formel wie „mit ÖAW-Beteiligung".
         - Die Forschenden, wenn eine Person als lead_author geführt wird: „Forschende um Armin Djamei".
         - Das Publikationsorgan, sofern es aus dem Material hervorgeht.
         - Fachbegriffe nennen und sofort erklären, statt sie wegzuabstrahieren: „ein Schlüsselprotein (Cce1) des Maisbeulenbrand-Pilzes" trägt, „ein Paar von Molekülen" trägt nicht. Dasselbe gilt für Arten, Orte, Verfahren und Zeitstellungen.
         - Größenordnungen aus der Quelle übernehmen: Fallzahl, Zeitraum, Anteil, Alter. Ziffern oder ausgeschrieben, beides ist recht.
         Was das Material nicht hergibt, erfindest du nicht. Fehlt ein Anker, lass ihn weg und schreibe KÜRZER. Vier magere Sätze sind besser als sechs, von denen zwei nur Länge erzeugen.

         NICHT in den Pitch gehören Aussagen darüber, wofür sich der Beitrag eignet: „dankbar für Bildstrecken", „ein wertvoller Baustein", „macht den Standort sichtbar", „eignet sich für ein Feature". Das steht bereits in target_audience und suggested_angle und verdrängt hier die Substanz. Der letzte Satz gehört der Sache oder ihrer Konsequenz, nicht ihrer Verwertbarkeit.

      7. target_audience: Konkrete österreichische Medienhäuser oder Journalist:innen-Typen (z.B. „Wissenschaftsredaktion ORF", „Der Standard Wissen", „APA Science", „Die Presse Gesundheit"). 2-4 Vorschläge, kommagetrennt.

      8. suggested_angle: Ein Satz auf Deutsch — narrative Stoßrichtung für Medienberichterstattung.

      9. reasoning: 2-3 Sätze auf Deutsch, die die Bewertung begründen. WICHTIG: nur lesbarer Fließtext, rein inhaltlich (Thema, Befunde, Anschlussfähigkeit, Erzählmaterial). Keine Variablennamen, keine Datenbankfelder, keine Code-Notation. KEINE Erwähnung der institutionellen Selbsteinstufung („pressetauglich markiert", „Highlight des Instituts" o.Ä.) und keine Erwähnung von Peer-Review-Status — diese Flags werden in der UI direkt aus der DB angezeigt und gehören nicht ins Modell-Reasoning.

      10. haiku: Ein deutsches Haiku zum Inhalt der Publikation. Drei Zeilen mit der klassischen Silbenfolge 5-7-5. Verfasst aus dem Inhalt, ohne Eigennamen oder technische Begriffe, die nur im Fachpublikum verständlich sind. Keine Reime erzwingen. Das Haiku soll den Kerngedanken des Beitrags in einem Bild verdichten und der Pressestelle als merkbarer Lesezeichen-Text dienen. Verwende echte deutsche Umlaute (ä, ö, ü, ß), niemals die Ersatzschreibweise „ae/oe/ue/ss" — moderne deutsche Typografie, keine Schreibmaschinen-Optik.

      11. Typografie (gilt für alle Textfelder oben): Verwende keine Geviertstriche bzw. Gedankenstriche (das Zeichen —). Formuliere stattdessen mit Komma, Doppelpunkt oder zwei Sätzen aus. Solche Striche wirken maschinell und sind projektweit unerwünscht (siehe docs/writing-style.md).

      --- Publication 1 ---
      Titel: Wie ein Pilz den Mais austrickst
      Titel (Originalsprache): How a smut fungus tricks maize
      Autor:innen: Armin Djamei
      Institut: GMI; Institut für Kulturgeschichte der Antike
      Erschienen: 2026-09-14
      Source-Signals (WebDB): peer_reviewed=true, popular_science=true
      Keywords: Mais, Ustilago maydis, Effektor, Cce1, Pflanzenimmunität, Pilz, Tumor, Landwirtschaft
      Inhaltsquelle: WebDB-Pressezusammenfassung (DE)
      Inhalt: Forschende zeigen, wie das Protein Cce1 des Maisbeulenbrand-Pilzes die Abwehr der Pflanze unterläuft.

      --- Publication 2 ---
      Titel: Jahresbericht 2025
      Autor:innen: Unbekannt
      Institut: N/A
      Erschienen: N/A
      Source-Signals (WebDB): peer_reviewed=false, popular_science=false
      Keywords: N/A
      Inhaltsquelle: KEIN INHALT VORHANDEN
      Inhalt: (kein Abstract, keine Zusammenfassung — Bewertung nur anhand Titel/Metadaten)

      Antworte AUSSCHLIESSLICH mit gültigem JSON in diesem exakten Format:
      {
        "evaluations": [
          {
            "publication_index": 1,
            "public_accessibility": 0.0,
            "societal_relevance": 0.0,
            "novelty_factor": 0.0,
            "storytelling_potential": 0.0,
            "media_timeliness": 0.0,
            "pitch_suggestion": "...",
            "target_audience": "...",
            "suggested_angle": "...",
            "reasoning": "...",
            "haiku": "..."
          }
        ]
      }"
    `);
  });
});
