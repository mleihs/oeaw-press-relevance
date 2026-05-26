import sanitizeHtml from 'sanitize-html';

// Server-side HTML helpers for the events feature. Two complementary
// operations on TYPO3 RTE output:
//
//   - `stripHtmlToText` returns plain text with paragraph + line-break
//     structure preserved. Used for the bodytext column on the detail
//     page, where we deliberately do NOT render structured HTML.
//   - `sanitizeEventInformation` returns sanitised HTML (whitelist of
//     a/p/br/h3-h6/ul/ol/li/strong/em/b/i/span) for the sidebar block,
//     where we DO want the editor's link / list / heading structure.
//
// Both are server-only — keeps sanitize-html out of the client bundle.
// The detail page consumes both through this single module so future
// HTML-handling logic for events lands here, not scattered across UI
// components.

/** Best-effort HTML → plain text. Preserves paragraph and line-break
 *  structure via `\n` markers, decodes the five common entities, drops
 *  everything else. Pipe into a `whitespace-pre-wrap` div without
 *  `dangerouslySetInnerHTML`; XSS-free by construction. */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Server-side HTML safelist for `tx_news_domain_model_news.event_information`.
 *  Editors at OEAW author this field in the TYPO3 RTE; the allow-list
 *  covers the tags they actually use (headings, paragraphs, lists, links)
 *  and drops everything else. Links get `target="_blank" rel="noopener
 *  noreferrer"` forced so external clicks can't reach back into the app.
 *
 *  Detail page renders the result with `dangerouslySetInnerHTML` because
 *  the safelist has already cleared scripts, event handlers and
 *  `javascript:` URLs. Covered by sanitize-event-info.test.ts (kept under
 *  that name for `git blame` continuity; the test file lives next to the
 *  function it exercises). */
export function sanitizeEventInformation(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'p', 'br', 'span',
      'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'strong', 'em', 'b', 'i',
    ],
    // `target` and `rel` MUST be in this list — sanitize-html runs
    // transformTags BEFORE the attribute allow-list pass, so without them
    // here the `target=_blank rel=noopener noreferrer` we add below would
    // get silently dropped (caught by sanitize-event-info.test.ts).
    allowedAttributes: {
      a: ['href', 'class', 'target', 'rel'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
    // Strip TYPO3-specific link schemes (t3://) the editor sometimes leaves
    // in download icons; without an allowed-scheme match sanitize-html
    // already drops the href, but this prevents the empty `<a>` shell from
    // staying visible-yet-dead in the rendered output.
    exclusiveFilter: (frame) =>
      frame.tag === 'a' && !frame.attribs.href,
  });
}
