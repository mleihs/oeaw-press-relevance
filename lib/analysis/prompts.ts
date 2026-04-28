import { Publication } from '../types';

export const SYSTEM_PROMPT = `You are a senior science communication expert at the Austrian Academy of Sciences (OeAW). Your expertise is identifying which research publications would interest journalists and the general public. You work in the communications department and regularly pitch stories to Austrian media outlets (ORF, Der Standard, Die Presse, APA, Wiener Zeitung, etc.). You evaluate research for its press-worthiness based on accessibility, societal relevance, novelty, storytelling potential, and media timeliness. Form your judgment primarily from the content itself. Structured source signals (peer_reviewed, popular_science) are weak context, not endorsements — popular_science=true means the originating institute marked the publication as potentially press-relevant, but institutes apply this flag inconsistently and self-promotionally, so do not let it drive the scoring. Always respond with valid JSON only.`;

function wordTruncate(text: string, maxWords: number): string {
  const parts = text.split(/\s+/);
  if (parts.length <= maxWords) return text;
  return parts.slice(0, maxWords).join(' ') + '…';
}

/**
 * Pick the best available content source for a publication. The priority order
 * matters: summary_de is a curated German press-style summary written by
 * domain experts, far better signal than a translated journal abstract.
 */
function pickContent(pub: Publication): { text: string; kind: string } | null {
  if (pub.summary_de?.trim()) {
    return { text: wordTruncate(pub.summary_de.trim(), 500), kind: 'WebDB-Pressezusammenfassung (DE)' };
  }
  if (pub.summary_en?.trim()) {
    return { text: wordTruncate(pub.summary_en.trim(), 500), kind: 'WebDB summary (EN)' };
  }
  if (pub.enriched_abstract?.trim()) {
    return { text: wordTruncate(pub.enriched_abstract.trim(), 500), kind: 'Enriched abstract' };
  }
  if (pub.abstract?.trim()) {
    return { text: wordTruncate(pub.abstract.trim(), 500), kind: 'Original abstract' };
  }
  if (pub.citation?.trim()) {
    return { text: wordTruncate(pub.citation.trim(), 500), kind: 'Citation only (no abstract available)' };
  }
  return null;
}

function authorsLine(pub: Publication): string {
  if (pub.lead_author?.trim()) {
    const lead = pub.lead_author.trim();
    if (pub.authors?.trim()) {
      const all = pub.authors.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      const others = all.filter((a) => !a.includes(lead.split(',')[0])).slice(0, 2);
      return others.length > 0 ? `${lead}; co-authors: ${others.join(', ')}` : lead;
    }
    return lead;
  }
  if (pub.authors?.trim()) {
    return pub.authors.split(/[;,]/).slice(0, 3).map((s) => s.trim()).join(', ');
  }
  return 'Unbekannt';
}

export function buildEvaluationPrompt(publications: Publication[]): string {
  const pubDescriptions = publications.map((pub, idx) => {
    const content = pickContent(pub);
    const keywords = pub.enriched_keywords?.slice(0, 8).join(', ') || 'N/A';
    const titleLine = pub.original_title && pub.original_title.trim() && pub.original_title.trim() !== pub.title.trim()
      ? `Titel: ${pub.title}\nTitel (Originalsprache): ${pub.original_title}`
      : `Titel: ${pub.title}`;

    const sourceSignals = [
      `peer_reviewed=${pub.peer_reviewed ? 'true' : 'false'}`,
      `popular_science=${pub.popular_science ? 'true' : 'false'}`,
    ].join(', ');

    return `--- Publication ${idx + 1} ---
${titleLine}
Autor:innen: ${authorsLine(pub)}
Institut: ${pub.institute || 'N/A'}
Erschienen: ${pub.published_at || 'N/A'}
Source-Signals (WebDB): ${sourceSignals}
Keywords: ${keywords}
Inhaltsquelle: ${content?.kind ?? 'KEIN INHALT VORHANDEN'}
Inhalt: ${content?.text ?? '(kein Abstract, keine Zusammenfassung — Bewertung nur anhand Titel/Metadaten)'}`;
  }).join('\n\n');

  return `Bewerte die folgenden ${publications.length} wissenschaftlichen Publikationen der Österreichischen Akademie der Wissenschaften (OeAW) hinsichtlich ihres Interesses für österreichische Medien und die breite Öffentlichkeit.

Bewerte ausschließlich aus dem Inhalt heraus. Die Source-Signals sind reiner Kontext und dürfen weder die Scores beeinflussen noch im Output erwähnt werden:
- popular_science=true → institutsinterne Selbstmarkierung, uneinheitlich gesetzt. Ignorieren. Nicht im reasoning, nicht in pitch_suggestion, nicht in suggested_angle erwähnen — das Flag wird in der UI ohnehin direkt aus der DB angezeigt.
- peer_reviewed=true → ebenfalls nicht im Output erwähnen; sagt nichts über Pressetauglichkeit.
- Die Inhaltsquelle „WebDB-Pressezusammenfassung (DE)" ist eine vom Institut kuratierte, nicht-technische Beschreibung — sie liefert besseres Material zur Beurteilung als ein roher Abstract, ist aber selbst kein Qualitätsbeleg (Institute schreiben sie z.T. werblich).

Liefere für JEDE Publikation:
1. public_accessibility (0.0-1.0): Wie leicht können Nicht-Fachleute die Forschung verstehen? Berücksichtige Fachjargon, Konzeptkomplexität und ob Erkenntnisse einfach erklärbar sind.
2. societal_relevance (0.0-1.0): Auswirkung auf Gesundheit, Umwelt, Wirtschaft, Kultur oder Alltag. Wie direkt betrifft das Menschen?
3. novelty_factor (0.0-1.0): Durchbruch? Stellt es bestehende Annahmen in Frage, ist es ein Paradigmenwechsel oder liefert es unerwartete Resultate?
4. storytelling_potential (0.0-1.0): Können Journalist:innen daraus eine fesselnde Erzählung bauen? Gibt es Human-Interest-Aspekte, visuelle Elemente, lebensnahe Szenarien?
5. media_timeliness (0.0-1.0): Anschlussfähig an aktuellen öffentlichen Diskurs, jüngste Ereignisse, Trends, saisonale Themen?

6. pitch_suggestion: Schreibe einen 4-6-sätzigen deutschen Pitch, den ein:e Pressereferent:in beim Anpitchen an Journalist:innen verwenden kann. Inkludiere einen Aufhänger, das Hauptergebnis, warum es für die Öffentlichkeit relevant ist, und was es einzigartig oder zeitgemäß macht. Sprache zugänglich, lebendig, fachfremd.

7. target_audience: Konkrete österreichische Medienhäuser oder Journalist:innen-Typen (z.B. „Wissenschaftsredaktion ORF", „Der Standard Wissen", „APA Science", „Die Presse Gesundheit"). 2-4 Vorschläge, kommagetrennt.

8. suggested_angle: Ein Satz auf Deutsch — narrative Stoßrichtung für Medienberichterstattung.

9. reasoning: 2-3 Sätze auf Deutsch, die die Bewertung begründen. WICHTIG: nur lesbarer Fließtext, rein inhaltlich (Thema, Befunde, Anschlussfähigkeit, Erzählmaterial). Keine Variablennamen, keine Datenbankfelder, keine Code-Notation. KEINE Erwähnung der institutionellen Selbsteinstufung („pressetauglich markiert", „Highlight des Instituts" o.Ä.) und keine Erwähnung von Peer-Review-Status — diese Flags werden in der UI direkt aus der DB angezeigt und gehören nicht ins Modell-Reasoning.

10. haiku: Ein deutsches Haiku zum Inhalt der Publikation. Drei Zeilen mit der klassischen Silbenfolge 5-7-5. Verfasst aus dem Inhalt, ohne Eigennamen oder technische Begriffe, die nur im Fachpublikum verständlich sind. Keine Reime erzwingen. Das Haiku soll den Kerngedanken des Beitrags in einem Bild verdichten und der Pressestelle als merkbarer Lesezeichen-Text dienen. Verwende echte deutsche Umlaute (ä, ö, ü, ß), niemals die Ersatzschreibweise „ae/oe/ue/ss" — moderne deutsche Typografie, keine Schreibmaschinen-Optik.

${pubDescriptions}

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
}`;
}
