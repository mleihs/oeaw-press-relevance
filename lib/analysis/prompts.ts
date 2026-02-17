import { Publication } from '../types';

export const SYSTEM_PROMPT = `You are a senior science communication expert at the Austrian Academy of Sciences (OeAW). Your expertise is identifying which research publications would interest journalists and the general public. You work in the communications department and regularly pitch stories to Austrian media outlets (ORF, Der Standard, Die Presse, APA, Wiener Zeitung, etc.). You evaluate research for its press-worthiness based on accessibility, societal relevance, novelty, storytelling potential, and media timeliness. Always respond with valid JSON only.`;

export function buildEvaluationPrompt(publications: Publication[]): string {
  const pubDescriptions = publications.map((pub, idx) => {
    const content = pub.enriched_abstract || pub.abstract || pub.citation || '';
    const truncated = content.split(/\s+/).slice(0, 500).join(' ');
    const authors = pub.authors ? pub.authors.split(/[;,]/).slice(0, 3).join(', ') : 'Unknown';
    const keywords = pub.enriched_keywords?.slice(0, 8).join(', ') || 'N/A';

    return `--- Publication ${idx + 1} ---
Title: ${pub.title}
Authors: ${authors}
Institute: ${pub.institute || 'N/A'}
Published: ${pub.published_at || 'N/A'}
Keywords: ${keywords}
Content: ${truncated}`;
  }).join('\n\n');

  return `Evaluate the following ${publications.length} academic publications from OeAW for public/journalist interest.

For EACH publication, provide:
1. public_accessibility (0.0-1.0): How easily non-experts can understand the research. Consider jargon level, concept complexity, and whether findings can be explained simply.
2. societal_relevance (0.0-1.0): Impact on health, environment, economy, culture, or daily life. How directly does this affect people?
3. novelty_factor (0.0-1.0): Is this a breakthrough? Does it challenge existing beliefs, represent a paradigm shift, or produce unexpected results?
4. storytelling_potential (0.0-1.0): Can journalists build a compelling narrative? Are there human interest angles, visual elements, or relatable scenarios?
5. media_timeliness (0.0-1.0): Does this connect to current public discourse, recent events, trending topics, or seasonal relevance?

6. pitch_suggestion: Write a 4-6 sentence German pitch that a press officer could use when contacting journalists. Include a hook, the key finding, why it matters to the public, and what makes it unique or timely. Use accessible, engaging, non-specialist language.

7. target_audience: Suggest specific media outlets or journalist types (e.g., "Wissenschaftsredaktion ORF", "Der Standard Wissen", "APA Science", "Die Presse Gesundheit")

8. suggested_angle: One sentence German narrative angle for media coverage.

9. reasoning: 2-3 sentence rationale for the scores given.

${pubDescriptions}

Respond with ONLY valid JSON in this exact format:
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
      "reasoning": "..."
    }
  ]
}`;
}
