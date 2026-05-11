# WebDB Import — TYPO3 MySQL → Postgres

This document describes how ÖAW's TYPO3-based WebDB is mirrored into the
local Postgres schema via `scripts/webdb-import.mjs`.

> **Status:** stub. Full content lands in Phase 1 / Block 2 of
> [OSS_READINESS_PLAN.md](../OSS_READINESS_PLAN.md).

## Source

ÖAW WebDB is a TYPO3 extension. The export is a MySQL dump (~660 MB
unkompressiert) covering publications, persons, organisational units,
projects, lectures, and the Austrian science taxonomy (ÖSTAT-6).

## Target Schema

Postgres tables: `publications`, `persons`, `orgunits`, `extunits`,
`projects`, `lectures`, `oestat6_categories`, and the M:N junction
tables. See `supabase/migrations/` for the canonical contract.

## ETL Pipeline

- Skips `t3ver_*` / mirror tables and `deleted = 1` rows
- UPSERT pattern (non-destructive since 2026-04-30)
- ~1 min for 37k publications + junctions

## Natural Keys & DOI Fallback

- `webdb_uid` is the natural key for publications
- DOIs are extracted from 14 different TYPO3 fields (citation, endnote,
  ris, etc.) — see `scripts/lib/doi-extract.mjs`
- URL-slug heuristic for embedded DOIs

## Adapting for Other CMSs

The Postgres schema in `supabase/migrations/` is the contract. Rewrite
the script's source-reader for your CMS format while preserving the
UPSERT target shape.
