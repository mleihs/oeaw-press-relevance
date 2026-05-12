---
date: 2026-05-11
status: accepted
deciders: Phase-3 migration session
supersedes: none
---

# 0005 — Aggregation SQL functions stay in Postgres

## Context

Six aggregations on the analyst-facing routes are implemented as
`LANGUAGE sql STABLE` (or plpgsql) functions in
`supabase/migrations/*.sql`: `top_researchers`,
`researcher_distribution`, `researcher_detail`,
`publication_dashboard_stats`, `similar_pressed_pubs`,
`pub_ids_by_oestat6`. They embed Bayes-smoothing, sparkline windowing,
percentile bucketing, cosine-distance kNN, and oestat6 hierarchy
expansion. Phase 3 could have rewritten them as Drizzle query trees in
TypeScript. We did not.

## Decision

Aggregation logic stays in Postgres. Drizzle routes call functions via
`db.execute(sql\`SELECT * FROM fn(...)\`)` and cast the result to the
shared DTO. The rule for new aggregations: prefer a Postgres function
when the query (a) touches ≥3 tables **and** (b) returns a bounded
result via SQL `LIMIT`. Lookup-style routes (`/api/orgunits`,
`/api/publication-types`) stay in pure Drizzle.

## Consequences

- ✅ Single round-trip — Bayes-smoothing and sparkline bucketing happen
  next to the data, no app-side N+1.
- ✅ Postgres can plan ivfflat / btree-gist indexes on these queries.
- ✅ Any self-hoster on Postgres ≥ 15 runs the same plpgsql; no Drizzle
  version coupling for the heavy aggregations.
- ⚠️ Function signatures aren't introspected — renaming a `p_metric`
  argument in SQL silently breaks the Drizzle call site at runtime, not
  compile time. Each route that calls a function must keep its smoke
  test green per release.
- ⚠️ Unit tests need testcontainers (not pg-proxy) because pg-mem can't
  execute plpgsql — see `docs/TESTING.md` §2.3.

## Alternatives considered

- **Re-implement in Drizzle** — `top_researchers` would need 100k+ rows
  joined and aggregated in TypeScript, blowing app memory; rejected.
- **Materialized views** — earlier `RESEARCHERS_PLAN.md` ruled out for
  the MVP (refresh cadence unclear, write amplification on import);
  rejected.

## References

- `supabase/migrations/*.sql`
- `docs/IMPLEMENTATION.md` §3 ("Postgres is the real backend")
- `docs/TESTING.md` §2 (testing ladder per query type)
