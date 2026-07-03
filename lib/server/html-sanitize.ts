import 'server-only';

import type sanitizeHtml from 'sanitize-html';

// Gemeinsame Link-Härtung für alle sanitize-html-Aufrufer (Events-RTE,
// Board-Markdown). EINE Quelle für die sicherheitsrelevante Anchor-Policy —
// eine Änderung (Scheme-Fix, rel-Anpassung) gilt damit überall.
//
// Falle (in beiden Konsumenten testabgedeckt): sanitize-html führt
// transformTags VOR dem Attribut-Filter aus — `target`/`rel` müssen daher
// beim Aufrufer in allowedAttributes.a stehen, sonst wird das hier gesetzte
// target=_blank/rel wieder verworfen.

export const ANCHOR_ALLOWED_SCHEMES = ['https', 'http', 'mailto', 'tel'];

/** Erzwingt target="_blank" rel="noopener noreferrer" auf jedem <a>. */
export const anchorTransform: sanitizeHtml.Transformer = (tagName, attribs) => ({
  tagName: 'a',
  attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
});

/** Entfernt leere <a>-Hüllen (href über nicht-erlaubtes Schema verworfen),
 *  damit kein sichtbar-toter Link stehen bleibt. */
export const emptyAnchorFilter = (frame: sanitizeHtml.IFrame): boolean =>
  frame.tag === 'a' && !frame.attribs.href;
