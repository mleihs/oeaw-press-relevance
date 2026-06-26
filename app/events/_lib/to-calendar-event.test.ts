import { describe, it, expect } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import { toCalendarEvent, readChipData } from './to-calendar-event';
import type { Event } from '@/lib/server/events/to-api';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'e1',
    webdb_uid: 1,
    title: 'Quantenchaos-Vortrag',
    teaser: null,
    bodytext: null,
    event_information: null,
    event_at: '2026-07-01T16:00:00Z', // 18:00 Vienna (UTC+2 summer)
    event_end_at: null,
    location_title: 'Festsaal',
    organizer_title: null,
    institute: null,
    url: null,
    lang: null,
    available_langs: [],
    decision: 'undecided',
    decided_at: null,
    flag_notes: [],
    analysis_status: null,
    event_score: null,
    public_appeal: null,
    scientific_significance: null,
    reach: null,
    timeliness: null,
    pitch_suggestion: null,
    suggested_angle: null,
    target_audience: null,
    reasoning: null,
    llm_model: null,
    analysis_cost: null,
    analyzed_at: null,
    synced_at: '2026-06-01T00:00:00Z',
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('toCalendarEvent', () => {
  it('converts the UTC timestamp to Vienna civil time', () => {
    const sx = toCalendarEvent(makeEvent());
    expect(sx.start).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(sx.start.hour).toBe(18);
    expect(sx.start.timeZoneId).toBe('Europe/Vienna');
    expect(sx._timeLabel).toBe('18:00');
  });

  it('defaults a missing end to start + 1h', () => {
    const sx = toCalendarEvent(makeEvent());
    expect(Temporal.ZonedDateTime.compare(sx.end, sx.start.add({ hours: 1 }))).toBe(0);
  });

  it('honours a real multi-hour / multi-day end', () => {
    const sx = toCalendarEvent(
      makeEvent({ event_end_at: '2026-07-03T16:00:00Z' }),
    );
    expect(sx.end.day).toBe(3);
  });

  it('corrects a non-positive span to +1h', () => {
    const sx = toCalendarEvent(
      makeEvent({ event_end_at: '2026-07-01T16:00:00Z' }), // == start
    );
    expect(Temporal.ZonedDateTime.compare(sx.end, sx.start)).toBe(1);
  });

  it('exposes score only when analyzed', () => {
    expect(
      toCalendarEvent(makeEvent({ analysis_status: 'analyzed', event_score: 0.82 }))
        ._score,
    ).toBe(0.82);
    expect(toCalendarEvent(makeEvent({ analysis_status: 'analyzed', event_score: 0.82 }))._analyzed).toBe(true);

    // pending / failed / null status → no score surfaced
    expect(toCalendarEvent(makeEvent({ analysis_status: 'pending', event_score: 0.5 }))._analyzed).toBe(false);
    expect(toCalendarEvent(makeEvent())._score).toBeNull();
    expect(toCalendarEvent(makeEvent())._analyzed).toBe(false);
  });

  it('stashes the decision for the chip border', () => {
    expect(toCalendarEvent(makeEvent({ decision: 'pitch' }))._decision).toBe('pitch');
  });
});

describe('readChipData', () => {
  it('round-trips the stashed fields off a loosely-typed event', () => {
    const sx = toCalendarEvent(
      makeEvent({ decision: 'hold', analysis_status: 'analyzed', event_score: 0.6 }),
    );
    const chip = readChipData(sx as unknown as Record<string, unknown>);
    expect(chip).toMatchObject({
      id: 'e1',
      title: 'Quantenchaos-Vortrag',
      _score: 0.6,
      _analyzed: true,
      _decision: 'hold',
      _timeLabel: '18:00',
    });
  });

  it('defaults safely on a bare object', () => {
    const chip = readChipData({});
    expect(chip._score).toBeNull();
    expect(chip._analyzed).toBe(false);
    expect(chip._decision).toBe('undecided');
  });
});
