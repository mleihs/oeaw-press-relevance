import { describe, it, expect } from 'vitest';
import {
  gatePayloadSchema,
  personDetailQuerySchema,
  researchersLeaderboardQuerySchema,
  similarPressedQuerySchema,
  publicationsListQuerySchema,
  analyzedExportQuerySchema,
  publicationsStatsQuerySchema,
  pressReleasesQuerySchema,
  reviewQueueQuerySchema,
} from './schemas';

describe('gatePayloadSchema', () => {
  it('accepts a non-empty password', () => {
    expect(gatePayloadSchema.safeParse({ password: 'hunter2' }).success).toBe(
      true,
    );
  });
  it('rejects empty / missing / non-string password', () => {
    expect(gatePayloadSchema.safeParse({ password: '' }).success).toBe(false);
    expect(gatePayloadSchema.safeParse({}).success).toBe(false);
    expect(gatePayloadSchema.safeParse({ password: 5 }).success).toBe(false);
  });
});

describe('personDetailQuerySchema', () => {
  it('requires since=YYYY-MM-DD', () => {
    expect(
      personDetailQuerySchema.safeParse({ since: '2026-05-17' }).success,
    ).toBe(true);
    expect(personDetailQuerySchema.safeParse({}).success).toBe(false);
    expect(
      personDetailQuerySchema.safeParse({ since: '17.05.2026' }).success,
    ).toBe(false);
  });
  it('exclude_* are true-by-absence, false only on literal "false"', () => {
    const d = personDetailQuerySchema.parse({ since: '2026-01-01' });
    expect(d.exclude_ita).toBe(true);
    expect(d.exclude_outreach).toBe(true);
    expect(
      personDetailQuerySchema.parse({ since: '2026-01-01', exclude_ita: 'false' })
        .exclude_ita,
    ).toBe(false);
    expect(
      personDetailQuerySchema.parse({ since: '2026-01-01', exclude_ita: 'x' })
        .exclude_ita,
    ).toBe(true);
  });
});

describe('researchersLeaderboardQuerySchema', () => {
  const base = { since: '2026-01-01' };
  it('applies the per-route limit default and metric/scope defaults', () => {
    const dist = researchersLeaderboardQuerySchema(500).parse(base);
    expect(dist.limit).toBe(500);
    expect(dist.metric).toBe('count_high');
    expect(dist.authorship_scope).toBe('all');
    expect(dist.min_value).toBe(1);
    expect(researchersLeaderboardQuerySchema(50).parse(base).limit).toBe(50);
  });
  it('opt-in flags are false-by-absence (=== "true" semantics)', () => {
    const q = researchersLeaderboardQuerySchema(50).parse(base);
    expect(q.include_external).toBe(false);
    expect(q.member_only).toBe(false);
    expect(
      researchersLeaderboardQuerySchema(50).parse({
        ...base,
        include_external: 'true',
      }).include_external,
    ).toBe(true);
  });
  it('rejects bad metric / scope and non-numeric limit (was a NaN::int 500)', () => {
    const s = researchersLeaderboardQuerySchema(50);
    expect(s.safeParse({ ...base, metric: 'zzz' }).success).toBe(false);
    expect(s.safeParse({ ...base, authorship_scope: 'zzz' }).success).toBe(
      false,
    );
    expect(s.safeParse({ ...base, limit: 'abc' }).success).toBe(false);
  });
  it('keeps min_value fractional (numeric, not int)', () => {
    expect(
      researchersLeaderboardQuerySchema(50).parse({ ...base, min_value: '0.5' })
        .min_value,
    ).toBe(0.5);
  });
});

describe('similarPressedQuerySchema', () => {
  it('defaults limit=3 and the SPECTER2 model', () => {
    const q = similarPressedQuerySchema.parse({});
    expect(q.limit).toBe(3);
    expect(q.model).toBe('allenai/specter2_base');
  });
  it('rejects a non-numeric limit', () => {
    expect(similarPressedQuerySchema.safeParse({ limit: 'abc' }).success).toBe(
      false,
    );
  });
});

describe('publicationsListQuerySchema (permissive)', () => {
  it('defaults page=1/pageSize=20, empty string falls back too', () => {
    expect(publicationsListQuerySchema.parse({}).page).toBe(1);
    expect(publicationsListQuerySchema.parse({ page: '' }).page).toBe(1);
    expect(publicationsListQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(
      50,
    );
  });
  it('rejects the prior 500 vectors (page=abc / page=0)', () => {
    expect(publicationsListQuerySchema.safeParse({ page: 'abc' }).success).toBe(
      false,
    );
    expect(publicationsListQuerySchema.safeParse({ page: '0' }).success).toBe(
      false,
    );
  });
  it('passes arbitrary filter params through (.loose, no surprise 400)', () => {
    const r = publicationsListQuerySchema.safeParse({
      search: 'x',
      oestat6_ids: 'a,b',
      press_released: 'true',
      sort: 'whatever',
    });
    expect(r.success).toBe(true);
  });
});

describe('already-safe routes: schemas never reject current valid traffic', () => {
  it('analyzed export: analyzed defaults true, "false" opts out', () => {
    expect(analyzedExportQuerySchema.parse({}).analyzed).toBe(true);
    expect(
      analyzedExportQuerySchema.parse({ analyzed: 'false' }).analyzed,
    ).toBe(false);
  });
  it('stats: default_eligible is opt-in', () => {
    expect(publicationsStatsQuerySchema.parse({}).default_eligible).toBe(false);
    expect(
      publicationsStatsQuerySchema.parse({ default_eligible: 'true' })
        .default_eligible,
    ).toBe(true);
  });
  it('press-releases / review-queue accept any current param shape', () => {
    expect(
      pressReleasesQuerySchema.safeParse({
        stats: 'true',
        orphans: 'false',
        with_pub: 'true',
      }).success,
    ).toBe(true);
    expect(
      reviewQueueQuerySchema.safeParse({ sort: 'combined', decision: 'pitch' })
        .success,
    ).toBe(true);
    expect(reviewQueueQuerySchema.safeParse({}).success).toBe(true);
  });
});
