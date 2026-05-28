import sanitizeHtml from 'sanitize-html';

// Server-side HTML helpers for the events feature. The strip-to-text path
// (formerly `stripHtmlToText`) lives in `lib/shared/html-utils.ts` as
// `decodeHtmlBlock` — same intent, broader entity support, sub/sup→Unicode,
// client-safe. This module keeps the sanitize path: the allow-list-based
// transform used to render TYPO3 RTE output via dangerouslySetInnerHTML on
// the event detail page. Stays server-only because `sanitize-html` is too
// heavy for the client bundle and the only consumer is an RSC.

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
