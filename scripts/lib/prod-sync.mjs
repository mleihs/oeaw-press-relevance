// Pure diff helpers for the local→prod sync scripts
// (push-analysis-to-prod.mjs, sync-missing-pubs-to-prod.mjs). Kept here so the
// node-run .mjs scripts import them directly (cf. scripts/lib/doi-extract.mjs).
// No DB / no I/O — the scripts keep every query + transaction. Unit-tested in
// prod-sync.test.mjs.

/**
 * Elements of `ids` that are NOT in `presentSet`. The set-difference kernel
 * behind "which local rows are absent from prod", applied per-chunk against a
 * prod-side existence probe.
 */
export function setDifference(ids, presentSet) {
  return ids.filter((id) => !presentSet.has(id));
}

/**
 * Partition locally-scored rows against prod for push-analysis-to-prod.mjs.
 * `prodScoreById` maps a prod publication id → its current press_score; an
 * ABSENT key means the row does not exist in prod yet (a numeric 0 counts as
 * scored — only `null` is "present but unscored"). Returns:
 *   - present       rows that exist in prod
 *   - missing       rows absent from prod (need the full Phase-7 row sync)
 *   - presentNull   present rows whose prod press_score IS NULL
 *   - presentScored present rows that already carry a prod score
 *   - toWrite       what an UPDATE should target: `present` with --overwrite,
 *                   else `presentNull` — never clobber an existing prod score.
 */
export function partitionForPush(localRows, prodScoreById, overwrite) {
  const present = localRows.filter((r) => prodScoreById.has(r.id));
  const missing = localRows.filter((r) => !prodScoreById.has(r.id));
  const presentNull = present.filter((r) => prodScoreById.get(r.id) === null);
  const presentScored = present.filter((r) => prodScoreById.get(r.id) !== null);
  const toWrite = overwrite ? present : presentNull;
  return { present, missing, presentNull, presentScored, toWrite };
}
