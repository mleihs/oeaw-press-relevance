import { describe, it, expect, afterEach, vi } from 'vitest';
import { assertScoringPreconditions, scoringDisabledReason } from './gate';
import { ScoringEffortError, ScoringModelError, ScoringProviderError } from './errors';
import { errorClassFor } from '@/lib/shared/scoring/run-classify';

const OPUS = 'anthropic/claude-opus-5.5';

afterEach(() => vi.unstubAllEnvs());

function env(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

describe('assertScoringPreconditions', () => {
  it('wirft ohne Anthropic-Key einen ScoringProviderError (provider_gate)', () => {
    env({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_EFFORT: undefined });
    const err = (() => {
      try {
        assertScoringPreconditions({ model: OPUS });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ScoringProviderError);
    expect(errorClassFor(err)).toBe('provider_gate');
  });

  it('wirft bei einem Modell außerhalb von Anthropic einen ScoringProviderError', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_EFFORT: undefined });
    expect(() => assertScoringPreconditions({ model: 'deepseek/deepseek-chat' })).toThrow(ScoringProviderError);
  });

  it('wirft bei einem Nicht-Opus-Modell einen ScoringModelError (model_gate)', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_EFFORT: undefined });
    expect(() => assertScoringPreconditions({ model: 'anthropic/claude-sonnet-5' })).toThrow(ScoringModelError);
  });

  it('wirft bei ANTHROPIC_EFFORT=high einen ScoringEffortError (effort_gate)', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_EFFORT: 'high' });
    expect(() => assertScoringPreconditions({ model: OPUS })).toThrow(ScoringEffortError);
  });

  it('liefert Key, Modell und Effort max, wenn alles passt', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_EFFORT: 'max' });
    expect(assertScoringPreconditions({ model: OPUS })).toEqual({ apiKey: 'sk-ant-x', model: OPUS, effort: 'max' });
    env({ ANTHROPIC_EFFORT: undefined });
    expect(assertScoringPreconditions({ model: OPUS, apiKey: 'sk-ant-y' })).toMatchObject({
      apiKey: 'sk-ant-y',
      effort: 'max',
    });
  });
});

describe('scoringDisabledReason', () => {
  it('meldet den Not-Aus vor allem anderen', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', SCORING_NIGHTLY_ENABLED: 'false' });
    expect(scoringDisabledReason()).toBe('switched_off');
  });

  it('meldet eine Instanz ohne Anthropic-Key (Vercel-Standby)', () => {
    env({ ANTHROPIC_API_KEY: undefined, SCORING_NIGHTLY_ENABLED: undefined });
    expect(scoringDisabledReason()).toBe('no_anthropic');
  });

  it('ist null, wenn die Instanz bewerten kann', () => {
    env({ ANTHROPIC_API_KEY: 'sk-ant-x', SCORING_NIGHTLY_ENABLED: 'true' });
    expect(scoringDisabledReason()).toBeNull();
  });
});
