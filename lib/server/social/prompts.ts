// Prompts for the social-media monitor. Two LLM tasks:
//   1. Per-post: extract a topic, keywords, and a one-line German summary.
//   2. Overview: aggregate the recent posts into a "Lagebild" — the themes
//      currently being covered across the watched channels, plus a short
//      narrative the press team reads at a glance.

export const SYSTEM_PROMPT = `Du bist Medienbeobachter:in im Kommunikationsteam der Österreichischen Akademie der Wissenschaften (ÖAW). Du wertest Instagram-Posts von Wissenschafts- und Geschichts-Kanälen aus, um dem Presseteam einen schnellen Überblick zu geben, welche Themen dort gerade behandelt werden. Antworte ausschließlich mit gültigem JSON gemäß dem geforderten Schema. Alle Texte auf Deutsch, sachlich und knapp.`;

export interface PostForPrompt {
  index: number;
  channel: string;
  mediaType: string | null;
  caption: string;
}

const MAX_CAPTION_CHARS = 1200;

function clip(s: string, n = MAX_CAPTION_CHARS): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Per-post topic/keyword/summary extraction. Returns a prompt expecting
 *  `{ "results": [{ "index", "topic", "keywords": [...], "summary_de" }] }`. */
export function buildPostPrompt(posts: PostForPrompt[]): string {
  const items = posts
    .map(
      (p) =>
        `### Post ${p.index} (Kanal: ${p.channel}${p.mediaType ? `, Typ: ${p.mediaType}` : ''})\n${clip(p.caption) || '(kein Text)'}`,
    )
    .join('\n\n');

  return `Analysiere die folgenden ${posts.length} Instagram-Posts. Bestimme für jeden Post:
- "topic": das behandelte Thema in 2–6 Wörtern (z.B. "Klimawandel und Gletscher")
- "keywords": 3–6 prägnante Schlagworte (Substantive, klein geschrieben außer Eigennamen)
- "summary_de": eine sachliche Zusammenfassung in 1 Satz, worum es im Post geht

Gib NUR dieses JSON zurück:
{"results":[{"index":<zahl>,"topic":"...","keywords":["...","..."],"summary_de":"..."}]}

Die "index"-Werte müssen exakt den Post-Nummern unten entsprechen.

${items}`;
}

export interface PostForOverview {
  /** Stable 1-based index the LLM echoes back in post_indices. */
  index: number;
  channel: string;
  topic: string | null;
  keywords: string[];
  caption: string;
}

/** Aggregate recent posts into themes + a narrative overview. Each theme also
 *  reports which posts belong to it (`post_indices`, echoing the numbers below)
 *  so the UI can expand a theme to its member posts. Returns a prompt expecting
 *  `{ "themes": [{theme, description, channels[], post_count, keywords[],
 *  post_indices[]}], "narrative_de": "..." }`. */
export function buildOverviewPrompt(
  posts: PostForOverview[],
  windowDays: number,
): string {
  const items = posts
    .map(
      (p) =>
        `[#${p.index}] [${p.channel}] ${p.topic ?? '?'}${p.keywords.length ? ` (${p.keywords.join(', ')})` : ''}: ${clip(p.caption, 200) || '(kein Text)'}`,
    )
    .join('\n');

  return `Hier sind ${posts.length} Instagram-Posts der letzten ${windowDays} Tage von mehreren beobachteten Kanälen, jeweils mit einer Nummer [#N]. Erstelle ein "Lagebild": Welche Themen werden gerade behandelt?

Fasse zu 3–8 übergeordneten Themen zusammen (nicht pro Post, sondern bündele Verwandtes). Jeder Post gehört zu genau einem Thema. Für jedes Thema:
- "theme": kurzer Titel (2–5 Wörter)
- "description": 1 Satz, was darunter fällt
- "channels": Liste der Kanäle (Handles), die dieses Thema behandeln
- "post_indices": die Nummern [#N] der Posts, die zu diesem Thema gehören
- "post_count": Anzahl der zugehörigen Posts (Länge von post_indices)
- "keywords": 3–6 Schlagworte

Schreibe außerdem "narrative_de": 2–4 Sätze Fließtext, der die aktuelle Lage zusammenfasst: was dominiert, was ist auffällig, welche Themen könnten für die ÖAW-Pressearbeit relevant sein.

Gib NUR dieses JSON zurück:
{"themes":[{"theme":"...","description":"...","channels":["..."],"post_indices":[<zahl>],"post_count":<zahl>,"keywords":["..."]}],"narrative_de":"..."}

Posts:
${items}`;
}
