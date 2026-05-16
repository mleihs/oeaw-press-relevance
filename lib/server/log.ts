/**
 * Structured JSON-lines logger. Zero dependencies on purpose: Vercel's Node
 * runtime captures stdout/stderr and parses JSON lines, so `vercel logs
 * --json` yields flat, greppable fields without any transport. pino would add
 * Next.js App-Router bundling friction (worker-thread transport, the
 * serverExternalPackages dance, see the postgres-bundling scar in
 * docs/adr/) while we'd use none of its value-adds at our log volume.
 *
 * The API is pino-shaped (info/warn/error/child) so swapping to pino later,
 * if we ever need redaction or sampling, is a single-file change.
 *
 * Each line is one JSON object: { level, time, msg, ...fields }. An `err` or
 * `error` field carrying an Error is expanded to { err: { name, message,
 * stack } } so stack traces stay greppable.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Returns a logger that prepends `bindings` to every record. */
  child(bindings: LogFields): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        ...(err.cause !== undefined ? { cause: String(err.cause) } : {}),
      },
    };
  }
  return { err: { message: String(err) } };
}

function write(
  level: LogLevel,
  bindings: LogFields,
  msg: string,
  fields?: LogFields,
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
  // Keep the test runner's output clean; logging is asserted by the prod
  // `vercel logs --json` cross-check, not by Vitest (no logger spec).
  if (process.env.VITEST) return;

  const merged: LogFields = { ...bindings, ...fields };
  const rawErr = merged.err ?? merged.error;
  if (rawErr !== undefined) {
    delete merged.err;
    delete merged.error;
    Object.assign(merged, serializeError(rawErr));
  }

  const record = { level, time: new Date().toISOString(), msg, ...merged };
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    // Circular/unserializable field — emit a minimal record rather than throw.
    line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg,
      _unserializable: true,
    });
  }

  const sink = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  sink.write(line + '\n');
}

function make(bindings: LogFields): Logger {
  return {
    debug: (m, f) => write('debug', bindings, m, f),
    info: (m, f) => write('info', bindings, m, f),
    warn: (m, f) => write('warn', bindings, m, f),
    error: (m, f) => write('error', bindings, m, f),
    child: (b) => make({ ...bindings, ...b }),
  };
}

/** Process-wide root logger. Prefer `requestLogger(req)` inside route code. */
export const log: Logger = make({});

function randomId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Per-request child logger bound to { route, method, requestId }. requestId
 * prefers Vercel's `x-vercel-id` so a log line can be correlated with the
 * platform request trace; falls back to a random id locally.
 */
export function requestLogger(req: Request): Logger {
  let route = 'unknown';
  try {
    route = new URL(req.url).pathname;
  } catch {
    // Non-URL request (e.g. a hand-built test double) — keep 'unknown'.
  }
  const requestId =
    req.headers.get('x-vercel-id') ??
    req.headers.get('x-request-id') ??
    randomId();
  return log.child({ route, method: req.method, requestId });
}
