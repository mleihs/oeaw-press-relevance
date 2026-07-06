import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { log, requestLogger } from './log';

/**
 * Uniform JSON error response. Used everywhere route handlers need to
 * short-circuit with a 4xx/5xx — single shape `{ error: string }`.
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * CSRF guard: rejects state-changing requests whose Origin (or, falling
 * back, Referer) host does not match the request's Host header. Browsers
 * always send Origin on cross-origin POST/PUT/PATCH/DELETE, so this stops
 * a third-party page from triggering an authenticated mutation via the
 * gate cookie. Returns the 403 Response on mismatch, or `null` to let the
 * handler proceed.
 *
 * Wired into `withApiError` below for every mutating method, so individual
 * routes don't need to opt in.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function assertSameOrigin(req: Request): Response | null {
  const host = req.headers.get('host');
  if (!host) return apiError('Missing host header', 403);

  const origin = req.headers.get('origin');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return apiError('Cross-origin request not allowed', 403);
    }
    if (originHost !== host) {
      return apiError('Cross-origin request not allowed', 403);
    }
    return null;
  }

  // Origin missing. Fall back to Referer for older clients / non-CORS POSTs.
  const referer = req.headers.get('referer');
  if (referer) {
    let refererHost: string;
    try {
      refererHost = new URL(referer).host;
    } catch {
      return apiError('Cross-origin request not allowed', 403);
    }
    if (refererHost !== host) {
      return apiError('Cross-origin request not allowed', 403);
    }
    return null;
  }

  // Strict posture: no Origin and no Referer on a mutating request gets blocked.
  return apiError('Missing origin/referer header', 403);
}

/**
 * Allow-list check for origins used to construct user-visible URLs
 * (e.g. MeisterTask task descriptions). assertSameOrigin already
 * blocks cross-origin requests, but an attacker who controls X-Forwarded-Host
 * could trick `req.nextUrl.origin` into echoing a spoofed host through
 * both checks if Origin and Host are spoofed together. This second-line
 * check forces the resulting URL to be one of our known deployments.
 *
 * Configurable via `ALLOWED_ORIGINS` env var (comma-separated); defaults
 * cover the two Vercel projects + localhost dev.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://oeaw-press-relevance.vercel.app',
  'https://oeaw-press-release.vercel.app',
  'http://localhost:3000',
];

export function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS;
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertAllowedOrigin(origin: string): Response | null {
  if (getAllowedOrigins().includes(origin)) return null;
  return apiError('Origin not in allow-list', 400);
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
 * Wraps an SSE `ReadableStream` in a `Response` with the standard
 * `text/event-stream` headers. Pairs with `createSSEStream()` — the batch
 * routes (analysis, enrichment) build a stream and return it through this.
 */
export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Maps a thrown value to an `apiError` payload. Use in route catch blocks
 * to keep handlers focused on the happy path. Status defaults to 500;
 * pass another for validation/billing/auth/etc. Optional `fallback`
 * overrides the "Unknown error" string used when `err` is not an Error
 * instance (e.g. set to "Invalid request" for JSON-parse catches).
 */
export function errorToApiResponse(
  err: unknown,
  status = 500,
  fallback = 'Unknown error',
) {
  const message = err instanceof Error ? err.message : fallback;
  return apiError(message, status);
}

/**
 * Thrown by the validate* helpers when input fails its zod schema.
 * `withApiError` catches it and returns a deterministic 400 (not the 500
 * `route_unhandled_error` path). The message is the first zod issue, which
 * keeps parity with the per-route
 * `apiError(parsed.error.issues[0]?.message ?? '...', 400)` block these
 * helpers replace (ADR 0018).
 */
export class ApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiValidationError';
  }
}

/**
 * Thrown by `requireUser()`/`requireAdmin()` (lib/server/auth/require.ts)
 * when a route needs an authenticated Supabase-Auth identity. `withApiError`
 * maps it to a structured 401/403 instead of the 500 fallthrough — the same
 * contract ApiValidationError has for 400s.
 */
export class ApiAuthError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
  fallback: string,
): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiValidationError(parsed.error.issues[0]?.message ?? fallback);
  }
  return parsed.data;
}

/**
 * Validate a JSON request body. A missing/non-JSON body is treated as `{}`
 * (mirrors the prior flag/route.ts behaviour) so the schema — not a
 * bespoke try/catch per route — decides what is required. Throws
 * `ApiValidationError` → 400.
 */
export async function validateBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  return parseOrThrow(schema, raw, 'Invalid payload');
}

/**
 * Validate URL search params. Repeated keys collapse to the last value
 * (`Object.fromEntries` semantics); every validated route reads CSV-style
 * params as a single comma-joined string via `.get()`, never `.getAll()`,
 * so this is faithful to current usage — revisit if a route adopts
 * `getAll`. Throws `ApiValidationError` → 400.
 */
export function validateQuery<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
): z.infer<S> {
  return parseOrThrow(
    schema,
    Object.fromEntries(searchParams),
    'Invalid query',
  );
}

/**
 * Validate already-awaited dynamic route params (Next 16 `await params`).
 * Throws `ApiValidationError` → 400 (a malformed id becomes a clean 400
 * instead of an `invalid input syntax for type uuid` 500 downstream).
 */
export function validateParams<S extends z.ZodType>(
  params: unknown,
  schema: S,
): z.infer<S> {
  return parseOrThrow(schema, params, 'Invalid path parameter');
}

/**
 * Higher-order wrapper around route handlers. Two jobs:
 *
 * 1. **CSRF guard on mutating requests.** When the first arg is a
 *    Request with method POST/PUT/PATCH/DELETE, runs `assertSameOrigin`
 *    before the handler. A cross-origin request short-circuits with 403
 *    and never reaches the handler. GET/HEAD/OPTIONS skip the check
 *    (idempotent reads don't need CSRF protection and would break RSC
 *    fetches with no Origin header).
 *
 * 2. **Throw-to-500 fallthrough.** Any uncaught throw inside the
 *    handler becomes a 500 `{ error: <message> }` response via
 *    `errorToApiResponse`. Lets the happy path stay linear without
 *    try/catch boilerplate; validation errors remain explicit
 *    `return apiError(...)` early-returns.
 *
 * For sub-steps that need a non-500 status or custom fallback (JSON
 * parse → 400 "Invalid request", payload validation → 400 with a
 * specific error class), keep an inner try/catch and call
 * `errorToApiResponse(err, status, fallback)` directly.
 */
export function withApiError<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const req = args[0];
    const isReq = req instanceof Request;
    // Build the request-scoped logger only on the paths that actually log
    // (CSRF reject / uncaught throw). The happy path is the overwhelming
    // majority and never logs, so the URL parse + child allocation stay off
    // the hot path.
    const rlog = () => (isReq ? requestLogger(req) : log);
    try {
      if (isReq && MUTATING_METHODS.has(req.method.toUpperCase())) {
        const csrfFail = assertSameOrigin(req);
        if (csrfFail) {
          rlog().warn('csrf_rejected', { status: csrfFail.status });
          return csrfFail;
        }
      }
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiValidationError) {
        // Expected client error, not a route fault: warn (not error) and
        // return the structured 400 instead of the 500 fallthrough.
        rlog().warn('validation_rejected', { message: err.message });
        return apiError(err.message, 400);
      }
      if (err instanceof ApiAuthError) {
        // Expected auth rejection (kein/deaktiviertes Konto, fehlende
        // Admin-Rolle) — strukturierte 401/403 statt 500.
        rlog().warn('auth_rejected', { status: err.status, message: err.message });
        return apiError(err.message, err.status);
      }
      rlog().error('route_unhandled_error', { err });
      return errorToApiResponse(err);
    }
  };
}
