import { describe, it, expect } from 'vitest';
import { parseLooseJson, JsonParseError } from './json';

describe('parseLooseJson', () => {
  it('parses clean JSON objects and arrays', () => {
    expect(parseLooseJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
    expect(parseLooseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('strips ```json fences', () => {
    const input = '```json\n{"topic":"Klima","keywords":["co2"]}\n```';
    expect(parseLooseJson(input)).toEqual({ topic: 'Klima', keywords: ['co2'] });
  });

  it('strips bare ``` fences', () => {
    expect(parseLooseJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('ignores prose before and after the JSON', () => {
    const input = 'Hier ist das JSON:\n{"results":[{"index":1}]}\nViel Erfolg!';
    expect(parseLooseJson(input)).toEqual({ results: [{ index: 1 }] });
  });

  it('removes trailing commas', () => {
    expect(parseLooseJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
    expect(parseLooseJson('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  it('repairs truncated objects by closing open brackets', () => {
    // Cut off mid-array (max_tokens hit) — recover the complete prefix.
    const input = '{"themes":[{"theme":"A","keywords":["x","y"]}';
    expect(parseLooseJson(input)).toEqual({
      themes: [{ theme: 'A', keywords: ['x', 'y'] }],
    });
  });

  it('repairs a truncated results array (real-world max_tokens cutoff)', () => {
    const input =
      '{"results":[{"index":1,"topic":"Hexen","keywords":["a","b"],"summary_de":"Der Post behandelt die Verhaftung von Johannes';
    const out = parseLooseJson<{ results: { index: number }[] }>(input);
    expect(Array.isArray(out.results)).toBe(true);
    expect(out.results[0].index).toBe(1);
  });

  it('repairs a truncation that ends inside a string', () => {
    const input = '{"narrative_de":"Es dominiert das Thema Klima';
    expect(parseLooseJson(input)).toEqual({
      narrative_de: 'Es dominiert das Thema Klima',
    });
  });

  it('does not mistake braces inside strings for structure', () => {
    expect(parseLooseJson('{"caption":"a } b ] c"}')).toEqual({
      caption: 'a } b ] c',
    });
  });

  it('throws JsonParseError when nothing is recoverable', () => {
    expect(() => parseLooseJson('totally not json')).toThrow(JsonParseError);
  });
});
