import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubSentryEvent, sentryBaseOptions, sentryDataCollection } from './sentry';

/**
 * The scrubber is the backstop that keeps our own app secrets (gate token,
 * Supabase session, per-request LLM key) out of a third-party error store even
 * if the Next SDK attaches request context to an event. These tests pin that
 * contract.
 */
function eventWith(request: ErrorEvent['request']): ErrorEvent {
  return { request } as ErrorEvent;
}

describe('scrubSentryEvent', () => {
  it('redacts sensitive headers case-insensitively, keeps benign ones', () => {
    const out = scrubSentryEvent(
      eventWith({
        headers: {
          Authorization: 'Bearer secret',
          'X-OpenRouter-Key': 'sk-or-123',
          Cookie: 'gate=abc',
          'content-type': 'application/json',
        },
      }),
    );
    expect(out.request?.headers).toEqual({
      Authorization: '[redacted]',
      'X-OpenRouter-Key': '[redacted]',
      Cookie: '[redacted]',
      'content-type': 'application/json',
    });
  });

  it('redacts the gate + Supabase cookies, keeps unrelated cookies', () => {
    const out = scrubSentryEvent(
      eventWith({
        cookies: { gate: 'hash', 'sb-access-token': 'jwt', theme: 'dark' },
      }),
    );
    expect(out.request?.cookies).toEqual({
      gate: '[redacted]',
      'sb-access-token': '[redacted]',
      theme: 'dark',
    });
  });

  it('drops the raw query string wholesale', () => {
    const out = scrubSentryEvent(eventWith({ query_string: 'token=abc&x=1' }));
    expect(out.request?.query_string).toBe('[redacted]');
  });

  it('is a no-op when there is no request context', () => {
    const event = { message: 'boom' } as ErrorEvent;
    expect(scrubSentryEvent(event)).toBe(event);
  });
});

/**
 * Sentry 11 collects user IP, cookies, HTTP bodies and DB query data unless
 * `dataCollection` says otherwise, and silently ignores the old
 * `sendDefaultPii`. These tests pin the restrictive v10 level.
 */
describe('sentryBaseOptions', () => {
  it('pins data collection to the restrictive v10 level', () => {
    expect(sentryBaseOptions.dataCollection).toBe(sentryDataCollection);
    expect(sentryDataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    });
    expect(sentryDataCollection.urlQueryParams.deny).toContain('-ip');
    expect(sentryDataCollection.httpHeaders.request.deny).toContain('forwarded');
  });

  it('carries no dropped v10 option and no tracing', () => {
    expect(sentryBaseOptions).not.toHaveProperty('sendDefaultPii');
    expect(sentryBaseOptions.tracesSampleRate).toBe(0);
  });
});
