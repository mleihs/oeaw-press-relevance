import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing the repo so the methods don't touch
// a real connection. Tests focus on early-return paths and result-mapping
// logic; deeper "does it actually return the right rows" coverage lives
// in the RSC smoke scripts (scripts/smoke/rsc/*.ts) against the local DB.
vi.mock('@/lib/server/db', () => {
  const mockDb = {
    execute: vi.fn(),
    select: vi.fn(),
  };
  return {
    db: mockDb,
    publications: { id: 'publications.id' },
    orgunitPublications: { publicationId: 'orgunit_publications.publication_id' },
    pressReleases: { publicationId: 'press_releases.publication_id' },
  };
});

import { publicationsRepo } from './publications';
import { db } from '@/lib/server/db';

const mockedDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findIdsByOestat6', () => {
  it('returns an empty Set without touching DB when input is []', async () => {
    const result = await publicationsRepo.findIdsByOestat6([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it('maps DB rows into a Set of publication_ids', async () => {
    mockedDb.execute.mockResolvedValue([
      { publication_id: 'pub-1' },
      { publication_id: 'pub-2' },
      { publication_id: 'pub-1' }, // dedup
    ] as never);
    const result = await publicationsRepo.findIdsByOestat6(['oe-1']);
    expect([...result].sort()).toEqual(['pub-1', 'pub-2']);
    expect(mockedDb.execute).toHaveBeenCalledOnce();
  });
});

describe('findIdsByHighlight', () => {
  it('returns empty Set when neither flag is set (no DB call)', async () => {
    const result = await publicationsRepo.findIdsByHighlight({
      mahighlight: false,
      highlight: false,
    });
    expect(result.size).toBe(0);
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it('hits the SQL function when at least one flag is set', async () => {
    mockedDb.execute.mockResolvedValue([{ publication_id: 'pub-h1' }] as never);
    const result = await publicationsRepo.findIdsByHighlight({
      mahighlight: true,
      highlight: false,
    });
    expect(result.has('pub-h1')).toBe(true);
    expect(mockedDb.execute).toHaveBeenCalledOnce();
  });
});

describe('findIdsByOrgunit', () => {
  it('returns empty Set when input is [] (no DB call)', async () => {
    const result = await publicationsRepo.findIdsByOrgunit([]);
    expect(result.size).toBe(0);
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});

describe('countWithFlags', () => {
  it('returns 0 when the SQL function reports zero rows', async () => {
    mockedDb.execute.mockResolvedValue([{ c: 0 }] as never);
    const result = await publicationsRepo.countWithFlags();
    expect(result).toBe(0);
  });

  it('extracts the count from the first row', async () => {
    mockedDb.execute.mockResolvedValue([{ c: 42 }] as never);
    const result = await publicationsRepo.countWithFlags();
    expect(result).toBe(42);
  });

  it('handles empty result array defensively (returns 0)', async () => {
    mockedDb.execute.mockResolvedValue([] as never);
    const result = await publicationsRepo.countWithFlags();
    expect(result).toBe(0);
  });
});
