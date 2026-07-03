// Fractional ranks for board ordering (LexoRank-style). A rank is a short
// lowercase string; ordering is plain lexicographic comparison, so Postgres
// (`ORDER BY rank`) and JS (`a < b`) agree without any decoding. Moving a card
// or column only rewrites that one row: the new rank is the midpoint between
// its two new neighbours, so concurrent moves never collide on a shared
// integer position (the realtime requirement from docs/BOARD_PLAN.md §3.2).
//
// Invariant: every rank produced here is non-empty, matches /^[a-z]+$/ and
// never ends in 'a' (the minimal character). Trailing-'a' keys are the one
// input the midpoint algorithm cannot split (nothing sorts between "b" and
// "ba"), so `rankBetween` rejects them up front — the invariant holds as long
// as all stored ranks come from this module.
//
// Midpoint algorithm adapted from the classic string-midpoint construction
// (m69, https://stackoverflow.com/a/38927158): walk past the common prefix,
// then either split the first differing character pair or extend past a run
// of minimal/maximal characters. Keys grow by at most one character per
// insertion and only when the gap is exhausted; `initialRanks` spaces seed
// data evenly so imports start with single short keys.

const CODE_BEFORE_A = 'a'.charCodeAt(0) - 1; // sentinel below the alphabet
const CODE_AFTER_Z = 'z'.charCodeAt(0) + 1; // sentinel above the alphabet
const BASE = 26;
// Last character may not be 'a', so the final position has BASE - 1 choices.
const LAST_DIGITS = BASE - 1;

/** Stored ranks: non-empty lowercase a-z, never ending in the minimal 'a'. */
export const RANK_PATTERN = /^[a-z]*[b-z]$/;

export function isValidRank(rank: string): boolean {
  return RANK_PATTERN.test(rank);
}

/**
 * Bytewise (Codeunit-)Vergleich zweier Ranks für `Array.sort`. MUSS überall
 * dort benutzt werden, wo Ranks client-seitig sortiert werden — `localeCompare`
 * wendet Locale-Collation an und kann von Postgres' `ORDER BY rank` (die Spalte
 * ist COLLATE "C") abweichen, wodurch Client- und Server-Reihenfolge in
 * Randfällen divergieren würden. Da alle Ranks aus /^[a-z]*[b-z]$/ stammen,
 * ist `<`/`>` exakt der bytewise Vergleich.
 */
export function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertBound(rank: string | null, side: 'prev' | 'next'): void {
  if (rank !== null && !isValidRank(rank)) {
    throw new RangeError(`invalid ${side} rank: ${JSON.stringify(rank)}`);
  }
}

/**
 * Return a rank strictly between `prev` and `next` (lexicographically).
 * `null` means the open end: `rankBetween(null, x)` sorts before everything
 * down to `x`, `rankBetween(x, null)` after it, `rankBetween(null, null)`
 * seeds an empty list. Throws when the bounds are invalid or not in order.
 */
export function rankBetween(prev: string | null, next: string | null): string {
  assertBound(prev, 'prev');
  assertBound(next, 'next');
  const lo = prev ?? '';
  const hi = next ?? '';
  if (next !== null && lo >= hi) {
    throw new RangeError(`rank bounds out of order: ${JSON.stringify(lo)} >= ${JSON.stringify(hi)}`);
  }

  let p = 0;
  let n = 0;
  let pos = 0;
  // Walk past the common prefix; sentinels stand in for exhausted strings.
  for (pos = 0; p === n; pos++) {
    p = pos < lo.length ? lo.charCodeAt(pos) : CODE_BEFORE_A;
    n = pos < hi.length ? hi.charCodeAt(pos) : CODE_AFTER_Z;
  }
  let out = lo.slice(0, pos - 1);

  if (p === CODE_BEFORE_A) {
    // `prev` is a proper prefix of `next`: copy next's run of minimal chars,
    // then split below its first splittable character.
    while (n === CODE_BEFORE_A + 1) {
      n = pos < hi.length ? hi.charCodeAt(pos++) : CODE_AFTER_Z;
      out += 'a';
    }
    if (n === CODE_BEFORE_A + 2) {
      // Next char is 'b': nothing fits between 'a…' and 'b', so descend.
      out += 'a';
      n = CODE_AFTER_Z;
    }
  } else if (p + 1 === n) {
    // Adjacent characters: keep prev's char and extend past its 'z' run.
    out += String.fromCharCode(p);
    n = CODE_AFTER_Z;
    while ((p = pos < lo.length ? lo.charCodeAt(pos++) : CODE_BEFORE_A) === CODE_AFTER_Z - 1) {
      out += 'z';
    }
  }

  return out + String.fromCharCode(Math.ceil((p + n) / 2));
}

/**
 * `count` evenly spaced ranks for seeding an ordered list in one go (column
 * seeds, MeisterTask import). Evenly spaced starting keys keep subsequent
 * midpoints short; appending via repeated `rankBetween(last, null)` would
 * work too but clusters everything at the top of the space.
 */
export function initialRanks(count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`invalid rank count: ${count}`);
  }
  if (count === 0) return [];

  // Shortest length whose capacity (last digit can't be 'a') fits the list
  // with a free slot at each end, so future prepends/appends stay short.
  let length = 1;
  let capacity = LAST_DIGITS;
  while (capacity < count + 1) {
    length++;
    capacity *= BASE;
  }

  const ranks: string[] = [];
  for (let i = 0; i < count; i++) {
    // Integer value in (0, capacity), then encoded with the non-'a' last digit.
    let value = Math.floor(((i + 1) * capacity) / (count + 1));
    let key = String.fromCharCode('a'.charCodeAt(0) + 1 + (value % LAST_DIGITS));
    value = Math.floor(value / LAST_DIGITS);
    for (let d = 1; d < length; d++) {
      key = String.fromCharCode('a'.charCodeAt(0) + (value % BASE)) + key;
      value = Math.floor(value / BASE);
    }
    ranks.push(key);
  }
  return ranks;
}
