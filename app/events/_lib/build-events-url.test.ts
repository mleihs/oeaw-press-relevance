import { describe, it, expect } from 'vitest';
import { buildEventsUrl } from './build-events-url';

describe('buildEventsUrl', () => {
  it('emits the canonical /events for defaults', () => {
    expect(buildEventsUrl({})).toBe('/events');
    expect(buildEventsUrl({ tab: 'upcoming' })).toBe('/events');
    expect(buildEventsUrl({ tab: null, main: false })).toBe('/events');
  });

  it('encodes a non-default decision tab', () => {
    expect(buildEventsUrl({ tab: 'pitch' })).toBe('/events?tab=pitch');
  });

  it('encodes the main-news opt-in', () => {
    expect(buildEventsUrl({ main: true })).toBe('/events?main=1');
  });

  it('encodes a calendar view with its date anchor', () => {
    expect(buildEventsUrl({ view: 'month', date: '2026-07-01' })).toBe(
      '/events?view=month&date=2026-07-01',
    );
  });

  it('drops date when no view is set (date is calendar-only)', () => {
    expect(buildEventsUrl({ date: '2026-07-01' })).toBe('/events');
  });

  it('preserves all state together in a stable order', () => {
    expect(
      buildEventsUrl({ tab: 'hold', main: true, view: 'week', date: '2026-07-13' }),
    ).toBe('/events?tab=hold&main=1&view=week&date=2026-07-13');
  });
});
