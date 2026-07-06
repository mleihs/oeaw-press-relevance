import 'server-only';

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import {
  ANCHOR_ALLOWED_SCHEMES,
  anchorTransform,
  emptyAnchorFilter,
} from '@/lib/server/html-sanitize';

// Markdown-Rendering für Board-Freitext (Kartenbeschreibung, Kommentare).
//
// Sicherheits-Posture: Nutzer tippen `description_md` / `body_md` als
// Markdown. `marked` reicht rohes HTML aus der Quelle DURCH (z. B. ein
// getipptes `<script>` oder `onerror=`), also MUSS die Ausgabe danach durch
// eine Allow-List — sonst ist das Feld ein gespeicherter XSS-Vektor, sobald
// es via `dangerouslySetInnerHTML` gerendert wird. Muster wie
// `sanitizeEventInformation` (lib/server/events/html-utils.ts): sanitize-html
// bleibt server-only (zu schwer fürs Client-Bundle; einziger Konsument sind
// der Board-Serverpfad und dessen JSON-Antworten). Der Client rendert nur
// das bereits gesäuberte HTML.

// GFM + weiche Zeilenumbrüche: ein einzelnes \n im Textarea wird zu <br>, so
// wie Redakteur:innen es beim Tippen erwarten (MeisterTask-Notizen sind
// zeilenorientiert, nicht Absatz-diszipliniert).
marked.setOptions({ gfm: true, breaks: true });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr',
    'strong', 'em', 'b', 'i', 'del', 's',
    'a',
    'ul', 'ol', 'li',
    'blockquote',
    'code', 'pre',
    'h3', 'h4', 'h5', 'h6',
  ],
  // `target`/`rel` MÜSSEN hier stehen: sanitize-html läuft transformTags VOR
  // dem Attribut-Filter (siehe lib/server/html-sanitize.ts).
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ANCHOR_ALLOWED_SCHEMES,
  // Marked erzeugt aus `#`/`##` immer <h1>/<h2>; wir wollen aber keine
  // Seiten-Level-Überschriften im Karten-Freitext (bräche die Dokument-
  // Gliederung/Screenreader). Auf <h3> herabstufen statt zu verwerfen, damit
  // der Text nicht verschwindet.
  transformTags: {
    a: anchorTransform,
    h1: 'h3',
    h2: 'h3',
  },
  exclusiveFilter: emptyAnchorFilter,
};

// @-Mentions: der Kommentar-Composer fügt `@[Anzeigename]` ein (Autocomplete
// über die Board-Member). Das Token ist bewusst id-los — es bleibt im Textarea
// lesbar und übersteht Umbenennungen als Klartext. `(?!\()` schützt normale
// Markdown-Links: `@[x](url)` bleibt unangetastet.
const MENTION_RE = /@\[([^\]\n]{1,80})\](?!\()/g;

/** Alle im Markdown erwähnten Anzeigenamen (dedupliziert, getrimmt). */
export function extractMentionNames(md: string): string[] {
  const names = new Set<string>();
  for (const m of md.matchAll(MENTION_RE)) {
    const name = m[1].trim();
    if (name) names.add(name);
  }
  return [...names];
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Rendert eine Markdown-Quelle zu gesäubertem HTML (safe für
 * dangerouslySetInnerHTML). Leere/whitespace-only Eingabe -> ''.
 *
 * Mention-Pipeline: Tokens werden VOR marked durch Private-Use-Platzhalter
 * ersetzt (damit marked Namen mit `*`/`_` nicht formatiert) und NACH
 * sanitize-html als <span class="mention"> eingesetzt. Weil der Span erst
 * nach der Sanitisierung entsteht, kann ihn kein Nutzer über getipptes HTML
 * einschleusen — ein rohes `<span class="mention">` fliegt aus der Allow-List.
 */
export function renderCardMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) return '';
  const slots: string[] = [];
  // Getippte Platzhalter-Zeichen entfernen — sonst könnte roher Text die
  // Mention-Ersetzung spoofen (U+E000/U+E001 sind Private-Use, nie legitim).
  const prepared = md.replace(/[\uE000\uE001]/g, '').replace(MENTION_RE, (_all, name: string) => {
    const i = slots.push(name.trim()) - 1;
    return `\uE000${i}\uE001`;
  });
  // marked.parse ist synchron, solange die async-Option nicht gesetzt ist.
  const rawHtml = marked.parse(prepared, { async: false }) as string;
  const clean = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
  if (slots.length === 0) return clean;
  return clean.replace(/\uE000(\d+)\uE001/g, (_all, i: string) => {
    const name = slots[Number(i)];
    return name === undefined ? '' : `<span class="mention">@${escapeHtml(name)}</span>`;
  });
}
