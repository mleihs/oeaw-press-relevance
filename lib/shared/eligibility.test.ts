import { describe, it, expect } from 'vitest';
import { ELIGIBILITY_EXCLUDE_TYPE_UIDS } from './eligibility';

describe('ELIGIBILITY_EXCLUDE_TYPE_UIDS', () => {
  // Pin test — small regression guard against accidental edits to the
  // canonical list. Drift between client and server is no longer a concern
  // (both import from this file) but the values themselves are domain
  // knowledge worth pinning: 5 = Rezension, 7 = Diplomarbeit, 8 = Dissertation,
  // 13 = Habilitation, 15 = Konferenz-Poster, 19 = Skriptum,
  // 23 = Lexikon-Stub.
  it('is the canonical [5, 7, 8, 13, 15, 19, 23]', () => {
    expect(ELIGIBILITY_EXCLUDE_TYPE_UIDS).toEqual([5, 7, 8, 13, 15, 19, 23]);
  });
});
