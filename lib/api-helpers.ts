import { NextRequest } from 'next/server';
import { createServerClient } from './supabase';

export function getSupabaseFromRequest(req: NextRequest) {
  const url = req.headers.get('x-supabase-url') || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = req.headers.get('x-supabase-key') || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  return createServerClient(url, key);
}

export function getOpenRouterKey(req: NextRequest): string {
  // Env variable takes priority — it's the canonical key from the main app
  const key = process.env.OPENROUTER_API_KEY || req.headers.get('x-openrouter-key') || '';
  if (!key) {
    throw new Error('OpenRouter API key not configured');
  }
  return key;
}

export function getLLMModel(req: NextRequest): string {
  return req.headers.get('x-llm-model') || 'anthropic/claude-sonnet-4';
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
