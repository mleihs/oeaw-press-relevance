import { describe, it, expect, vi } from 'vitest';
import {
  fillMissingLocationsViaLlm,
  type LlmLocationExtractor,
} from './llm-extract-location';

describe('fillMissingLocationsViaLlm', () => {
  function ev(over: Partial<{
    locationTitle: string | null;
    eventInformation: string | null;
    title: string;
  }> = {}) {
    return {
      locationTitle: null,
      eventInformation: '<p>some info</p>',
      title: 'Vortrag',
      ...over,
    };
  }

  it('only calls the extractor for rows missing locationTitle AND having event_information', async () => {
    const extractor = vi.fn<LlmLocationExtractor>(async () => 'Vienna');
    const events = [
      ev({ locationTitle: 'Saal A', eventInformation: '<p>x</p>' }), // has loc — skip
      ev({ locationTitle: null, eventInformation: null }),            // no info — skip
      ev({ locationTitle: null, eventInformation: '' }),              // empty info — skip
      ev({ locationTitle: null, eventInformation: '<p>x</p>', title: 'A' }), // call
      ev({ locationTitle: null, eventInformation: '<p>y</p>', title: 'B' }), // call
    ];

    const filled = await fillMissingLocationsViaLlm(events, extractor);

    expect(extractor).toHaveBeenCalledTimes(2);
    expect(extractor).toHaveBeenCalledWith({
      title: 'A',
      eventInformation: '<p>x</p>',
    });
    expect(filled).toBe(2);
    expect(events[3].locationTitle).toBe('Vienna');
    expect(events[4].locationTitle).toBe('Vienna');
    expect(events[0].locationTitle).toBe('Saal A'); // untouched
  });

  it('keeps locationTitle null when extractor returns null', async () => {
    const extractor = vi.fn<LlmLocationExtractor>(async () => null);
    const events = [ev()];
    const filled = await fillMissingLocationsViaLlm(events, extractor);
    expect(filled).toBe(0);
    expect(events[0].locationTitle).toBeNull();
  });

  it('returns 0 immediately when no candidates exist (no extractor calls)', async () => {
    const extractor = vi.fn<LlmLocationExtractor>(async () => 'X');
    const events = [
      ev({ locationTitle: 'Saal A' }),
      ev({ locationTitle: null, eventInformation: null }),
    ];
    const filled = await fillMissingLocationsViaLlm(events, extractor);
    expect(filled).toBe(0);
    expect(extractor).not.toHaveBeenCalled();
  });

  it('respects the maxConcurrent batch size', async () => {
    // 12 candidates × maxConcurrent=3 → 4 batches.
    const inFlight: number[] = [];
    let currentInFlight = 0;
    let maxObserved = 0;
    const extractor: LlmLocationExtractor = async () => {
      currentInFlight++;
      maxObserved = Math.max(maxObserved, currentInFlight);
      await new Promise((r) => setTimeout(r, 5));
      currentInFlight--;
      inFlight.push(currentInFlight);
      return 'X';
    };
    const events = Array.from({ length: 12 }, () => ev());
    await fillMissingLocationsViaLlm(events, extractor, 3);
    expect(maxObserved).toBeLessThanOrEqual(3);
  });
});
