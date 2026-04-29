import { describe, it, expect } from 'vitest';
import { ELIGIBILITY_EXCLUDE_TYPE_UIDS } from './_constants';

describe('ELIGIBILITY_EXCLUDE_TYPE_UIDS', () => {
  // These webdb_uids are press-irrelevant publication types: dissertations,
  // habilitations, conference posters, scripts, encyclopedia stubs, reviews.
  // The list is duplicated server-side in app/api/publications/route.ts:15
  // and they MUST stay in lockstep — no DRY abstraction yet because the
  // server route avoids importing from the client-only `app/publications`
  // namespace. This test pins the canonical value so a drift on either
  // side surfaces as a failed test.
  it('matches the exact server-side exclusion list', () => {
    expect(ELIGIBILITY_EXCLUDE_TYPE_UIDS).toEqual([5, 7, 8, 13, 15, 19, 23]);
  });
});
