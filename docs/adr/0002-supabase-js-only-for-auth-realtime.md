---
date: 2026-05-11
status: accepted
deciders: Phase-3 migration session
supersedes: none
---

# 0002 — Supabase-JS retained only for Auth / Realtime / RPC / Storage

## Context

After Phase 3 migrated every DB read and write to Drizzle, the
`@supabase/supabase-js` client could in principle have been removed.
However, the gate-cookie auth flow, future Realtime subscriptions, future
Storage uploads, and one-off RPC calls outside Drizzle's surface still
benefit from the official client. Two clients sharing one connection
pool would be fine for the DB; the question was: *where may an OSS
contributor still reach for `supabase-js`?*

## Decision

`lib/server/db/supabase.ts` is the **single** module that imports
`@supabase/supabase-js`. It exports `getSupabaseFromRequest` and
`getSupabaseAdmin` as the public surface. No other source file in
`lib/server/**`, `app/api/**`, or `app/**` may import `@supabase/supabase-js`
directly. This is enforced by code review today and could be enforced by an
ESLint `no-restricted-imports` rule when a regression appears.

## Consequences

- ✅ One audit point for "is this code path bypassing Drizzle?"
- ✅ A future regression (someone reaches for `supabase.from(…)` again)
  becomes visible in one file's diff.
- ✅ Bundle stays lean — `supabase-js` is server-only by import path.
- ⚠️ The helper module persists even with zero callers today
  (Auth/Realtime/Storage are not yet active features) — accepted as a
  documented export surface for the next contributor.

## Alternatives considered

- **Remove `supabase-js` entirely** — would require re-implementing
  gate-cookie validation against Supabase's auth schema; deferred.
- **Keep `supabase-js` for DB reads, Drizzle only for writes** — defeats
  the type-safety goal of ADR 0001; rejected.

## References

- `OSS_READINESS_PLAN.md` §7.6, §7.10
- `lib/server/db/supabase.ts`
- `memory/phase3_handover.md` (closeout note on §7.10)
