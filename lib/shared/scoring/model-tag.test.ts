import { describe, it, expect } from 'vitest';
import { autoModelTag, modelFromTag, AUTO_MODEL_LIKE, AUTO_TAG_SUFFIX } from './model-tag';
import { DEFAULT_LLM_MODEL } from '../constants';

describe('autoModelTag', () => {
  it('appends the suffix once', () => {
    expect(autoModelTag('anthropic/claude-opus-5.5')).toBe('anthropic/claude-opus-5.5-auto');
    expect(autoModelTag('anthropic/claude-opus-5.5-auto')).toBe('anthropic/claude-opus-5.5-auto');
  });

  it('round-trips through modelFromTag', () => {
    expect(modelFromTag(autoModelTag(DEFAULT_LLM_MODEL))).toBe(DEFAULT_LLM_MODEL);
    expect(modelFromTag('anthropic/claude-opus-5.5-session')).toBe('anthropic/claude-opus-5.5-session');
  });

  it('is matched by the LIKE detector for the default model', () => {
    const like = new RegExp(`^${AUTO_MODEL_LIKE.replace(/[.]/g, '\\.').replace(/%/g, '.*')}$`);
    expect(like.test(autoModelTag(DEFAULT_LLM_MODEL))).toBe(true);
    expect(like.test('anthropic/claude-opus-5.5-session')).toBe(false);
    expect(AUTO_MODEL_LIKE.endsWith(AUTO_TAG_SUFFIX)).toBe(true);
  });
});
