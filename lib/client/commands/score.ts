/**
 * Pure ranking for static command-palette entries. No 'use client', no
 * imports: it is isomorphic string logic, deliberately separated from the
 * icon-bearing registry so it stays trivially unit-testable in Node.
 *
 * The palette runs cmdk with shouldFilter={false} (Orama help results must
 * keep their own server ranking), so we rank static commands ourselves:
 * exact prefix > word-boundary substring > inner substring > loose
 * subsequence. Original implementation, not cmdk's internal command-score.
 */
export function scoreCommand(query: string, label: string, keywords?: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const hay = `${label} ${(keywords ?? []).join(' ')}`.toLowerCase();
  const idx = hay.indexOf(q);
  if (idx === 0) return 100;
  if (idx > 0) return hay[idx - 1] === ' ' ? 80 : 60;
  // subsequence fallback: every query char appears in order
  let h = 0;
  for (let i = 0; i < q.length; i++) {
    h = hay.indexOf(q[i], h);
    if (h === -1) return 0;
    h += 1;
  }
  return 20;
}
