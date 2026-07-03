/**
 * Single source of truth for React-Query keys that span more than one file.
 *
 * Why: a key like `['review-queue']` lived as a string literal in
 * `decision-toolbar.tsx` (invalidate-after-decision) and as a `REVIEW_QUEUE_KEY`
 * constant in `app/review/page.tsx` (the actual fetch). If one drifts the
 * cache no longer invalidates and stale rows linger silently — no compile
 * error, just buggy UX. Centralising makes the contract grep-able and
 * type-safe.
 *
 * Single-use keys (e.g. dashboard-only queries) are intentionally NOT here —
 * inlining them keeps the call site self-explanatory.
 */
export const QK = {
  publications: ['publications'] as const,
  publicationsList: ['publications-list'] as const,
  publication: (id: string) => ['publication', id] as const,
  reviewQueue: ['review-queue'] as const,
  recentSession: ['review-recent-session'] as const,
  events: ['events'] as const,
  event: (id: string) => ['event', id] as const,
  currentUser: ['current-user'] as const,
  adminUsers: ['admin-users'] as const,
  // Board (Redaktionsboard)
  boards: ['boards'] as const,
  board: (slug: string) => ['board', slug] as const,
  boardMembers: ['board-members'] as const,
  card: (id: string) => ['card', id] as const,
} as const;
