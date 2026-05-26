/** Site-scoped Google query as a fallback when the WebDB row has no
 *  direct URL (~59% of upcoming events). Site-scoping keeps the result
 *  list on oeaw.ac.at; quotes around the title get a more exact match.
 *
 *  Pure utility — lives in `_lib` instead of being a side-export of a
 *  Component file so the import graph stays straight. */
export function buildOeawSearchUrl(title: string): string {
  const q = `site:oeaw.ac.at "${title}"`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
