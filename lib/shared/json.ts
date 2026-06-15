// Hardened JSON parser for LLM output. Models in JSON mode usually return
// clean JSON, but not always: they wrap it in ```json fences, prepend a
// sentence ("Here is the JSON:"), leave a trailing comma, use single quotes,
// or get cut off mid-object when max_tokens is hit. `parseLooseJson` recovers
// from all of these so a slightly-off response is still usable.
//
// Strategy: fast path (plain JSON.parse) → fence-strip + extract the first
// balanced value (handles arbitrary prose around the JSON, which jsonrepair
// does NOT strip) → `jsonrepair` for the structural repairs (trailing commas,
// missing quotes, truncation, etc.). Pure + shared by every LLM call site and
// unit-tested in json.test.ts.

import { jsonrepair } from 'jsonrepair';

export class JsonParseError extends Error {
  constructor(public readonly raw: string) {
    super('Could not parse JSON from model output');
    this.name = 'JsonParseError';
  }
}

/** Strip a surrounding ```json … ``` (or bare ```) markdown fence. */
function stripFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Scan from the first `{`/`[` and return that JSON value's text plus whether it
 * closed cleanly (`complete`). For prose-wrapped clean JSON this isolates the
 * value (ignoring text on both sides); for truncated output it reports
 * `complete: false` so the caller hands the raw tail to jsonrepair (which
 * repairs truncation better than a naive auto-close). Null = no opener at all.
 */
function sliceBalancedJson(s: string): { text: string; complete: boolean } | null {
  const start = s.search(/[{[]/);
  if (start === -1) return null;

  const stack: string[] = [];
  let inStr = false;
  let esc = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) return { text: s.slice(start, i + 1), complete: true };
    }
  }

  return { text: s.slice(start), complete: false };
}

function tryParse<T>(s: string): T | undefined {
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

/**
 * Parse JSON from a possibly-messy model response. Strategies, in order:
 * fast path → the prose-stripped balanced value → jsonrepair on the
 * prose-stripped tail (handles truncation, trailing commas, single quotes,
 * comments). Throws JsonParseError only when no `{`/`[` is present at all (so
 * jsonrepair never coerces arbitrary prose into a JSON string).
 */
export function parseLooseJson<T = unknown>(input: string): T {
  const direct = tryParse<T>(input);
  if (direct !== undefined) return direct;

  const unfenced = stripFences(input.trim());
  const start = unfenced.search(/[{[]/);
  if (start === -1) throw new JsonParseError(input);

  // a) Clean JSON, possibly wrapped in prose on both sides.
  const balanced = sliceBalancedJson(unfenced);
  if (balanced?.complete) {
    const parsed = tryParse<T>(balanced.text);
    if (parsed !== undefined) return parsed;
  }

  // b) Repair the prose-stripped tail (jsonrepair closes truncated JSON,
  //    drops trailing commas, fixes quotes, etc.).
  const tail = unfenced.slice(start);
  try {
    return JSON.parse(jsonrepair(tail)) as T;
  } catch {
    // c) Last resort: repair the isolated balanced slice.
    if (balanced) {
      try {
        return JSON.parse(jsonrepair(balanced.text)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new JsonParseError(input);
  }
}
