import { NextResponse } from 'next/server';

/**
 * Uniform JSON error response. Used everywhere route handlers need to
 * short-circuit with a 4xx/5xx — single shape `{ error: string }`.
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Creates a ReadableStream + send/close helpers for SSE responses. The
 * `cancel()` handler is critical: when the consumer aborts (client
 * disconnect or fetch timeout) the controller is marked closed so
 * subsequent send/close calls become no-ops instead of throwing
 * "Invalid state: Controller is already closed". That error used to
 * escape as an unhandledRejection and, accumulated over many batches,
 * killed the dev server (2026-05-01 incident, ~88 enrichment batches in).
 */
export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  function send(event: string, data: unknown) {
    if (closed || !controller) return;
    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      // Race between cancel() and a pending enqueue — treat as closed.
      closed = true;
      controller = null;
    }
  }

  function close() {
    if (closed || !controller) return;
    try {
      controller.close();
    } catch {
      // Already closed by the consumer side.
    }
    closed = true;
    controller = null;
  }

  return { stream, send, close };
}

/**
 * Maps a thrown value to an `apiError` payload. Use in route catch blocks
 * to keep handlers focused on the happy path. Status defaults to 500;
 * pass another for billing/auth/etc.
 */
export function errorToApiResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return apiError(message, status);
}
