import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase';

/**
 * Server-only Supabase client. Reads URL+key from env exclusively — clients
 * cannot inject their own (B2 fix). For local dev: set SUPABASE_URL and
 * SUPABASE_ANON_KEY in .env.local. The legacy `NEXT_PUBLIC_*` variants are
 * still accepted as a fallback to avoid breaking existing deployments.
 */
export function getSupabaseFromRequest(_req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase credentials not configured (set SUPABASE_URL + SUPABASE_ANON_KEY in env)');
  }
  return createServerClient(url, key);
}

/**
 * Server-side admin client. Uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
 * Only mutating server routes (analysis batch, enrichment batch, CSV import)
 * should use this. Reads should keep using getSupabaseFromRequest (anon).
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured (mutating routes need it after RLS lockdown)');
  }
  return createServerClient(url, serviceKey);
}

/**
 * OpenRouter key — env takes priority, but a per-request header fallback is
 * kept because users may legitimately bring their own key for cost ownership.
 */
export function getOpenRouterKey(req: NextRequest): string {
  const key = process.env.OPENROUTER_API_KEY || req.headers.get('x-openrouter-key') || '';
  if (!key) {
    throw new Error('OpenRouter API key not configured');
  }
  return key;
}

/** Uniform JSON error response. D6 — used everywhere instead of inline JSON.stringify. */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getLLMModel(req: NextRequest): string {
  return req.headers.get('x-llm-model') || process.env.LLM_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';
}

export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  function send(event: string, data: unknown) {
    if (controller) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }
  }

  function close() {
    if (controller) {
      controller.close();
    }
  }

  return { stream, send, close };
}
