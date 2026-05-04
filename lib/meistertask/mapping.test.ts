import { describe, it, expect } from 'vitest';
import type { Publication } from '../types';
import { mapPublicationToTask } from './mapping';

const BASE_URL = 'http://localhost:3000';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: '479f418a-64f2-4870-a44c-a1e76d3ad6ff',
    webdb_uid: null,
    csv_uid: null,
    title: 'Quantum Sensing for Climate Modeling',
    original_title: null,
    lead_author: 'Schmidt, Anna',
    abstract: null,
    summary_de: null,
    summary_en: null,
    doi: '10.1234/qsens.2026',
    doi_link: null,
    published_at: '2026-03-15',
    publication_type: null,
    publication_type_id: null,
    open_access: false,
    open_access_status: null,
    oa_type: null,
    url: null,
    website_link: null,
    download_link: null,
    citation: null,
    citation_apa: null,
    citation_de: null,
    citation_en: null,
    ris: null,
    bibtex: null,
    endnote: null,
    peer_reviewed: false,
    popular_science: false,
    archived: false,
    webdb_tstamp: null,
    webdb_crdate: null,
    synced_at: null,
    enrichment_status: 'enriched',
    enriched_abstract: null,
    enriched_keywords: null,
    enriched_journal: null,
    enriched_source: null,
    full_text_snippet: null,
    word_count: 0,
    analysis_status: 'analyzed',
    press_score: 0.78,
    public_accessibility: null,
    societal_relevance: null,
    novelty_factor: null,
    storytelling_potential: null,
    media_timeliness: null,
    pitch_suggestion: 'Wie Quantensensoren die Klimavorhersage präziser machen.',
    target_audience: 'Wissenschaftsjournalismus, Politik',
    suggested_angle: 'Technologie-Durchbruch trifft Klimakrise',
    reasoning: 'Hohe gesellschaftliche Relevanz, breit verständlich.',
    haiku: 'Atome zittern\nWie Wärme durchs Wasser fließt\nMessen wir die Welt',
    llm_model: null,
    analysis_cost: null,
    import_batch: null,
    created_at: '2026-04-29T00:00:00Z',
    updated_at: '2026-04-29T00:00:00Z',
    meistertask_task_id: null,
    meistertask_task_token: null,
    decision: 'undecided',
    decided_at: null,
    decided_by: null,
    decision_rationale: null,
    snooze_until: null,
    flag_notes: [],
    decided_in_session: null,
    ...overrides,
  };
}

describe('mapPublicationToTask', () => {
  it('uses displayTitle for name', () => {
    const result = mapPublicationToTask(makePub(), { appBaseUrl: BASE_URL });
    expect(result.name).toBe('Quantum Sensing for Climate Modeling');
  });

  it('contains all sections when fields are populated', () => {
    const result = mapPublicationToTask(makePub(), { appBaseUrl: BASE_URL });
    expect(result.notes).toContain('## Pitch');
    expect(result.notes).toContain('## Blickwinkel');
    expect(result.notes).toContain('## Zielgruppe');
    expect(result.notes).toContain('## Begründung');
    expect(result.notes).toContain('## Haiku');
  });

  it('skips empty sections cleanly without orphan headers', () => {
    const pub = makePub({
      pitch_suggestion: null,
      suggested_angle: null,
      target_audience: null,
      reasoning: null,
      haiku: null,
    });
    const result = mapPublicationToTask(pub, { appBaseUrl: BASE_URL });
    expect(result.notes).not.toContain('## Pitch');
    expect(result.notes).not.toContain('## Blickwinkel');
    expect(result.notes).not.toContain('## Zielgruppe');
    expect(result.notes).not.toContain('## Begründung');
    expect(result.notes).not.toContain('## Haiku');
    // Footer must still be present.
    expect(result.notes).toContain('**StoryScore:**');
  });

  it('formats StoryScore as integer percent', () => {
    const result = mapPublicationToTask(makePub({ press_score: 0.847 }), { appBaseUrl: BASE_URL });
    expect(result.notes).toContain('**StoryScore:** 85%');
  });

  it('uses dash for missing DOI and shows DOI when present', () => {
    const withDoi = mapPublicationToTask(makePub({ doi: '10.1234/abc' }), { appBaseUrl: BASE_URL });
    expect(withDoi.notes).toContain('**DOI:** 10.1234/abc');

    const withoutDoi = mapPublicationToTask(makePub({ doi: null }), { appBaseUrl: BASE_URL });
    expect(withoutDoi.notes).toContain('**DOI:** –');
  });

  it('embeds the deep-link with the publication id', () => {
    const result = mapPublicationToTask(makePub(), { appBaseUrl: 'https://prod.example.com' });
    expect(result.notes).toContain(
      '[Original-Pub im Triage-Tool öffnen](https://prod.example.com/publications/479f418a-64f2-4870-a44c-a1e76d3ad6ff)',
    );
  });

  it('appends the HTML pub-id marker as the last non-empty line', () => {
    const result = mapPublicationToTask(makePub(), { appBaseUrl: BASE_URL });
    const lines = result.notes.trim().split('\n');
    const last = lines[lines.length - 1];
    expect(last).toBe('<!-- pub-id: 479f418a-64f2-4870-a44c-a1e76d3ad6ff -->');
  });

  it('boundary: score === 0.85 maps to highLabelId (>= threshold)', () => {
    const result = mapPublicationToTask(
      makePub({ press_score: 0.85 }),
      { appBaseUrl: BASE_URL, highLabelId: 100, midLabelId: 200 },
    );
    expect(result.label_ids).toEqual([100]);
  });

  it('boundary: score === 0.84 maps to midLabelId (< threshold)', () => {
    const result = mapPublicationToTask(
      makePub({ press_score: 0.84 }),
      { appBaseUrl: BASE_URL, highLabelId: 100, midLabelId: 200 },
    );
    expect(result.label_ids).toEqual([200]);
  });

  it('omits label_ids when label config is incomplete', () => {
    // only midLabelId given — incomplete pair, no labels at all
    const onlyMid = mapPublicationToTask(
      makePub(),
      { appBaseUrl: BASE_URL, midLabelId: 200 },
    );
    expect(onlyMid.label_ids).toBeUndefined();

    // neither given
    const neither = mapPublicationToTask(makePub(), { appBaseUrl: BASE_URL });
    expect(neither.label_ids).toBeUndefined();
  });
});
