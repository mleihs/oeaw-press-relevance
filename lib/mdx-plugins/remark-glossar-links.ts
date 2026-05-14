import type { Plugin } from 'unified';
import type { Root, Text, Link, Node } from 'mdast';
import { visit } from 'unist-util-visit';
import { GLOSSAR_TERMS } from './glossar-terms';

// Loose parent typing: the mdast `Parent` union excludes node types that can
// have children (e.g. `Heading`) due to discriminated-union narrowing across
// the mdast extension hierarchy. We only need `type` + `children` here, so
// fall back to a structural type.
type AnyParent = { type: string; children: Array<Node | Text | Link> };

// Skip-set of parent node types whose text content must not be auto-linked.
// `link` avoids nested anchors. `heading` keeps heading slugs clean. Code
// nodes preserve technical identifiers verbatim.
const SKIP_PARENT_TYPES = new Set(['link', 'heading', 'inlineCode', 'code']);

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sort longest-first so multi-word / hyphenated terms win over their shorter
// prefixes. Built at module load — the term map is static.
const SORTED_TERMS = Object.entries(GLOSSAR_TERMS).sort(
  ([a], [b]) => b.length - a.length,
);

/**
 * Remark plugin that walks the MDAST and rewrites the FIRST in-prose occurrence
 * of each glossary term as a link to the corresponding glossar section.
 *
 * Constraints:
 *   - Only the first occurrence per article gets linked (one link per term per
 *     page; readers don't need ten links to the same definition).
 *   - The glossar article itself is skipped (no self-links / recursive loops).
 *   - Text nodes inside <code>, <heading>, and existing links are skipped.
 *   - Word-boundary regex (`\b…\b`) so we don't match term substrings inside
 *     longer identifiers — but compound terms like "WebDB-Import" do match
 *     because the hyphen counts as a word boundary.
 */
export const remarkGlossarLinks: Plugin<[], Root> = () => {
  return (tree, file) => {
    const filePath: string = (file as { path?: string })?.path ?? '';
    if (filePath.endsWith('glossar.mdx')) return;

    const linkedTerms = new Set<string>();

    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      if (SKIP_PARENT_TYPES.has(parent.type)) return;
      const typedParent = parent as unknown as AnyParent;

      // Find the earliest match across all unlinked terms — earliest in the
      // text so we don't accidentally skip past one term while replacing
      // another later in the same node.
      let bestMatch: { term: string; url: string; start: number; end: number } | null = null;

      for (const [term, url] of SORTED_TERMS) {
        if (linkedTerms.has(term)) continue;
        const re = new RegExp(`\\b${escapeRegExp(term)}\\b`);
        const match = re.exec(node.value);
        if (!match) continue;
        if (!bestMatch || match.index < bestMatch.start) {
          bestMatch = {
            term,
            url,
            start: match.index,
            end: match.index + match[0].length,
          };
        }
      }

      if (!bestMatch) return;

      linkedTerms.add(bestMatch.term);

      const before = node.value.slice(0, bestMatch.start);
      const matched = node.value.slice(bestMatch.start, bestMatch.end);
      const after = node.value.slice(bestMatch.end);

      const replacement: Array<Text | Link> = [];
      if (before) {
        replacement.push({ type: 'text', value: before });
      }
      replacement.push({
        type: 'link',
        url: bestMatch.url,
        title: null,
        children: [{ type: 'text', value: matched }],
      });
      if (after) {
        replacement.push({ type: 'text', value: after });
      }

      typedParent.children.splice(index, 1, ...replacement);
      // Tell `visit` to continue at the after-text node (or just past this
      // replacement chain) so subsequent terms in `after` still get linked.
      return index + replacement.length;
    });
  };
};
