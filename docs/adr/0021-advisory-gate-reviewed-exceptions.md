---
date: 2026-07-30
status: accepted
deciders: /weiter ci session (Teil 2)
supersedes: none
---

# 0021 — CI security gate asks „gesichtet?", not „wie schlimm?"

## Context

The gate was `npm audit --audit-level=high` (`ci.yml`), and that flag is the only
lever such a gate has: one severity threshold for the whole graph. When `postcss`
hit an upstream-blocked advisory, the sole available reaction was to lower the
threshold globally. When those advisories were later re-rated to `high`, the lever
was spent and CI went red on **every** push from ≥ 2026-07-21 — for weeks, hiding a
real test failure (`5899832`; 715 tests passed, the suite failed, nobody looked).
Measured 2026-07-30: no state of this graph is both green and honest, since `next`
pins `postcss`/`sharp` and npm offers only major *downgrades*.

## Decision

Replace the threshold with `scripts/check-advisories.mjs` + a declarative
`scripts/advisory-policy.json`, wired as the required CI step „Advisory gate".
Advisories at or above `floor` must be gone or carry an entry with `advisory`,
`package`, `scope`, `reason`, `review_by`. **Three failure conditions, not one:**
unreviewed advisory, lapsed `review_by`, entry matching nothing. The latter two are
what keep this from being an ignore-list — green means every accepted risk is
*currently* justified **and** *currently* real. Fixing comes first; the policy is
only for advisories with no forward fix.

## Consequences

- ✅ A red CI mail is a signal again; new advisories still stop the build.
- ⚠️ CI goes red **by design** when a `review_by` lapses (next: 2026-10-31).
- ⚠️ `scope` uses npm's `nodes` paths, which shift on dedup. Deliberate: otherwise
  an exception for „postcss has an XSS" would also cover a future *direct*
  dependency on a vulnerable postcss. Condition 3 matches per entry, not per path,
  so a moved path cannot red the build for a non-security reason.
- ↔️ A dependency bump can now go red by *fixing* something — that is how
  GHSA-3jxr-9vmj-r5cp left the policy on day one.

## Alternatives considered

- Lower the threshold again (`--audit-level=critical`) — moves the problem one step
  and loses the remaining signal.
- `continue-on-error` / delete the step — restores the very defect being repaired.
- `audit-ci`, `better-npm-audit` — add transitive dependencies to the chain the gate
  inspects.

## References

- `b4422b5` gate + policy · `7a41036` condition 3 firing in real use · `ddfa217`
  majors measured (npm's `fixAvailable` shown to be wrong here).
- Measurements: `docs/RESUME_BEWERTEN_UND_CI.md` Teil 2; deferred majors in
  `docs/AUDIT_REMEDIATION_PLAN.md`. House style follows the sibling gates
  `scripts/check-schema-drift.mjs` and `scripts/check-em-dashes.sh`.
