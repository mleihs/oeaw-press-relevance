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

/**
 * Rendert eine Markdown-Quelle zu gesäubertem HTML (safe für
 * dangerouslySetInnerHTML). Leere/whitespace-only Eingabe -> ''.
 */
export function renderCardMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) return '';
  // marked.parse ist synchron, solange die async-Option nicht gesetzt ist.
  const rawHtml = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}
