import { describe, it, expect } from 'vitest';
import {
  parsePublicationsDelta,
  type PublicationsDeltaExport,
  type ExtractDoiFromRow,
} from './typo3-publications-delta';

// Stub-DOI-Extraktor: nimmt schlicht doi_link — deterministisch für Dedupe-Tests.
const stubDoi: ExtractDoiFromRow = (r) =>
  r.doi_link ? String(r.doi_link).toLowerCase() : null;

const pub = (over: Record<string, unknown> = {}) => ({
  _source_table: 'tx_hebowebdb_domain_model_publication',
  uid: 1001,
  deleted: '0',
  original_title: 'A paper',
  pub_date: '1776816000',
  type: '1',
  peer_reviewed: '1',
  popular_science: '0',
  open_access: '',
  lead_author: 'Doe, Jane',
  doi_link: '',
  ...over,
});

const person = (over: Record<string, unknown> = {}) => ({
  _source_table: 'tx_hebowebdb_domain_model_person',
  uid: 2001,
  deleted: '0',
  firstname: 'Jane',
  lastname: 'Doe',
  member_type: '0',
  external: '0',
  deceased: '0',
  use_vip: '0',
  ...over,
});

const wrap = (over: Partial<PublicationsDeltaExport['data']> = {}): PublicationsDeltaExport => ({
  meta: { generated_at_timestamp: 1783646552, generated_at_readable: '2026-07-10 03:22:32' },
  data: {
    records_to_delete: {},
    records_to_add_or_update: {},
    ...over,
  },
});

describe('parsePublicationsDelta — publications', () => {
  it('normalizes core fields and reads meta', () => {
    const { payload } = parsePublicationsDelta(
      wrap({ records_to_add_or_update: { tx_hebowebdb_domain_model_publication: [pub({ doi_link: '10.1/AbC' })] } }),
      stubDoi,
    );
    expect(payload.meta).toEqual({ generated_at_timestamp: 1783646552, generated_at_readable: '2026-07-10 03:22:32' });
    const p = payload.upsert.publications[0];
    expect(p.webdb_uid).toBe(1001);
    expect(p.title).toBe('A paper');
    expect(p.published_at).toBe('2026-04-22'); // 1776816000 unix → date
    expect(p.publication_type_webdb_uid).toBe(1);
    expect(p.peer_reviewed).toBe(true);
    expect(p.doi).toBe('10.1/abc'); // via stub, lowercased
  });

  it("pub_date '0' → published_at null; missing original_title → '(untitled)'", () => {
    const { payload } = parsePublicationsDelta(
      wrap({ records_to_add_or_update: { tx_hebowebdb_domain_model_publication: [pub({ pub_date: '0', original_title: '' })] } }),
      stubDoi,
    );
    const p = payload.upsert.publications[0];
    expect(p.published_at).toBeNull();
    expect(p.title).toBe('(untitled)');
    expect(p.original_title).toBeNull();
  });

  it("open_access 'oa_green' → open_access true + status/type set", () => {
    const { payload } = parsePublicationsDelta(
      wrap({ records_to_add_or_update: { tx_hebowebdb_domain_model_publication: [pub({ open_access: 'oa_green' })] } }),
      stubDoi,
    );
    const p = payload.upsert.publications[0];
    expect(p.open_access).toBe(true);
    expect(p.open_access_status).toBe('oa_green');
    expect(p.oa_type).toBe('oa_green');
  });

  it('in-batch DOI dedupe keeps the lowest webdb_uid, nulls the rest', () => {
    const { payload, stats } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_publication: [
            pub({ uid: 2000, doi_link: '10.5/same' }),
            pub({ uid: 1000, doi_link: '10.5/same' }),
          ],
        },
      }),
      stubDoi,
    );
    const byUid = Object.fromEntries(payload.upsert.publications.map((p) => [p.webdb_uid, p.doi]));
    expect(byUid[1000]).toBe('10.5/same'); // lowest uid keeps
    expect(byUid[2000]).toBeNull();
    expect(stats.dedupedDois).toBe(1);
  });

  it('routes deleted:"1" out of upsert into delete', () => {
    const { payload, stats } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_publication: [pub({ uid: 1001, deleted: '1' }), pub({ uid: 1002 })],
        },
      }),
      stubDoi,
    );
    expect(payload.upsert.publications.map((p) => p.webdb_uid)).toEqual([1002]);
    expect(payload.delete.publications).toContain(1001);
    expect(stats.routedDeletedPublications).toBe(1);
  });

  it('collects records_to_delete.publication uids and removes them from upsert', () => {
    const { payload } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: { tx_hebowebdb_domain_model_publication: [pub({ uid: 1001 })] },
        records_to_delete: { tx_hebowebdb_domain_model_publication: [{ uid: 1001 }] },
      }),
      stubDoi,
    );
    expect(payload.upsert.publications).toHaveLength(0);
    expect(payload.delete.publications).toEqual([1001]);
  });
});

describe('parsePublicationsDelta — persons', () => {
  it('normalizes and keeps member_type_webdb_uid raw for the applier to resolve', () => {
    const { payload } = parsePublicationsDelta(
      wrap({ records_to_add_or_update: { tx_hebowebdb_domain_model_person: [person({ member_type: '3', deceased: '1' })] } }),
      stubDoi,
    );
    const p = payload.upsert.persons[0];
    expect(p.webdb_uid).toBe(2001);
    expect(p.firstname).toBe('Jane');
    expect(p.member_type_webdb_uid).toBe(3);
    expect(p.deceased).toBe(true);
    expect(p.external).toBe(false);
  });

  it("member_type '0' → null (TYPO3 'unset', not a false unresolved-warning)", () => {
    const { payload } = parsePublicationsDelta(
      wrap({ records_to_add_or_update: { tx_hebowebdb_domain_model_person: [person({ member_type: '0' })] } }),
      stubDoi,
    );
    expect(payload.upsert.persons[0].member_type_webdb_uid).toBeNull();
  });

  it('tolerates upstream persons wrapped as [{…}] (single-element arrays)', () => {
    // Live-Export (2026-07) liefert Personen inkonsistent als [{…}] statt {…};
    // beide Formen dürfen nebeneinander vorkommen und müssen entpackt werden.
    const { payload } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_person: [
            [person({ uid: 2001 })] as never, // gewrappt
            person({ uid: 2002 }), // flach
          ],
        },
      }),
      stubDoi,
    );
    const uids = payload.upsert.persons.map((p) => p.webdb_uid).sort();
    expect(uids).toEqual([2001, 2002]);
  });

  it('routes a wrapped person with deleted:"1" to the delete set', () => {
    const { payload } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_person: [[person({ uid: 2003, deleted: '1' })] as never],
        },
      }),
      stubDoi,
    );
    expect(payload.upsert.persons).toHaveLength(0);
    expect(payload.delete.persons).toContain(2003);
  });
});

describe('parsePublicationsDelta — junctions', () => {
  it('emits person_publications even when the person is not in the person array', () => {
    const { payload } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_personpublication: [
            { person: '99999', publication: '1001', highlight: '0', mahighlight: '0', authorship: '?' },
          ],
        },
      }),
      stubDoi,
    );
    expect(payload.upsert.person_publications).toEqual([
      { person_webdb_uid: 99999, publication_webdb_uid: 1001, highlight: false, mahighlight: false, authorship: null },
    ]);
  });

  it('emits orgunit_publications (upsert + delete)', () => {
    const { payload } = parsePublicationsDelta(
      wrap({
        records_to_add_or_update: {
          tx_hebowebdb_domain_model_orgunitpublication: [
            { organizational_unit: '11411', publication: '1001', highlight: '1' },
          ],
        },
        records_to_delete: {
          tx_hebowebdb_domain_model_orgunitpublication: [{ organizational_unit: '11411', publication: '999' }],
        },
      }),
      stubDoi,
    );
    expect(payload.upsert.orgunit_publications).toEqual([
      { orgunit_webdb_uid: 11411, publication_webdb_uid: 1001, highlight: true },
    ]);
    expect(payload.delete.orgunit_publications).toEqual([
      { orgunit_webdb_uid: 11411, publication_webdb_uid: 999 },
    ]);
  });
});

describe('parsePublicationsDelta — robustness', () => {
  it('empty records_to_delete → empty arrays, not undefined', () => {
    const { payload } = parsePublicationsDelta(wrap(), stubDoi);
    expect(payload.delete).toEqual({
      publications: [],
      persons: [],
      person_publications: [],
      orgunit_publications: [],
    });
  });

  it('malformed envelope (no meta/data) → throws loudly, not a silent empty delta', () => {
    expect(() => parsePublicationsDelta({}, stubDoi)).toThrow(/envelope validation/);
    // a wrong-typed timestamp is also rejected
    expect(() =>
      parsePublicationsDelta(
        { meta: { generated_at_timestamp: 'nope' } } as never,
        stubDoi,
      ),
    ).toThrow(/envelope validation/);
  });

  it('valid meta + empty record groups → empty payload (legit empty delta)', () => {
    const { payload } = parsePublicationsDelta(wrap(), stubDoi);
    expect(payload.meta).toEqual({ generated_at_timestamp: 1783646552, generated_at_readable: '2026-07-10 03:22:32' });
    expect(payload.upsert.publications).toEqual([]);
    expect(payload.delete.publications).toEqual([]);
  });
});
