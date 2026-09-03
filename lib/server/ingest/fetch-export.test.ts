import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJsonExport, ExportFetchError } from './fetch-export';

// Gehärteter Export-Fetch mit gemocktem fetch — kein Netz. Festgenagelt werden
// die drei Nacht-Betrieb-Lektionen: (1) ein Timeout/Netzfehler wird als
// ExportFetchError MIT URL klassifiziert (nicht als nackte DOMException, Fix
// 2026-08-31), (2) HTTP-Fehler und CF-Challenge sind unterscheidbar, (3) ein
// 15-MB-HTML-Body landet NICHT in err.message (nur bodyHead = 200 Zeichen —
// der jq/Sentry-Vorfall aus der Nacht auf den 22.08.).

const URL_ = 'https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json';

beforeEach(() => {
  // Kein Origin-Pin: fetch läuft ohne undici-Dispatcher.
  delete process.env.OEAW_EXPORT_ORIGIN_IP;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Die Signatur nennt beide fetch-Argumente, obwohl die Implementierungen sie
 *  nicht brauchen: nur so tragen `fn.mock.calls` den Typ, mit dem der letzte
 *  Test Header und AbortSignal prueft. */
type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

const stubFetch = (impl: FetchImpl) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

describe('fetchJsonExport — Fehlerklassifikation', () => {
  it('Timeout → ExportFetchError mit URL in Meldung und Detail', async () => {
    stubFetch(() =>
      Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain('network error fetching');
    expect(err.message).toContain(URL_);
    expect(err.detail).toEqual({ url: URL_ });
  });

  it('HTTP 401 → ExportFetchError mit Status + bodyHead (klar von der Challenge unterscheidbar)', async () => {
    stubFetch(async () => new Response('denied', { status: 401 }));
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain('HTTP 401');
    expect(err.detail.status).toBe(401);
    expect(err.detail.bodyHead).toBe('denied');
    // Kein cfMitigated-Detail: das ist ein Auth-Fehler, keine Bot-Protection.
    expect(err.detail.cfMitigated).toBeUndefined();
  });

  it('cf-mitigated-Header → Challenge-Diagnose (auch bei 403)', async () => {
    stubFetch(
      async () =>
        new Response('<html>Just a moment…</html>', {
          status: 403,
          headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
        }),
    );
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain('Cloudflare challenge');
    expect(err.message).toContain('cf-mitigated: challenge');
    expect(err.detail.cfMitigated).toBe('challenge');
    expect(err.detail.status).toBe(403);
  });

  it('15-MB-HTML-Body: err.message bleibt klein, bodyHead ist auf 200 Zeichen gekappt', async () => {
    const hugeBody = '<html>' + 'x'.repeat(15 * 1024 * 1024);
    stubFetch(
      async () => new Response(hugeBody, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain("content-type='text/html'");
    // DER Regressionsfall: die Meldung darf den Body nicht mitschleppen.
    expect(err.message.length).toBeLessThan(1000);
    expect(err.detail.bodyHead).toHaveLength(200);
    expect(err.detail.bodyHead).toBe(hugeBody.slice(0, 200));
  });

  it('Mid-Body-Abbruch (res.text() wirft) → ExportFetchError mit URL + Status', async () => {
    const fake = {
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () =>
        Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    } as unknown as Response;
    stubFetch(async () => fake);
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain('network error reading body');
    expect(err.message).toContain(URL_);
    expect(err.detail).toEqual({ url: URL_, status: 200 });
  });

  it('kaputtes JSON trotz json-Content-Type → "invalid JSON" mit bodyHead', async () => {
    stubFetch(
      async () =>
        new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const err = (await fetchJsonExport(URL_).catch((e) => e)) as ExportFetchError;
    expect(err).toBeInstanceOf(ExportFetchError);
    expect(err.message).toContain('invalid JSON');
    expect(err.detail.bodyHead).toBe('{broken');
  });
});

describe('fetchJsonExport — Erfolgspfad', () => {
  it('parst JSON und schickt Browser-Header mit AbortSignal', async () => {
    const fn = stubFetch(
      async () =>
        new Response(JSON.stringify({ meta: { generated_at_timestamp: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const json = await fetchJsonExport(URL_);
    expect(json).toEqual({ meta: { generated_at_timestamp: 1 } });
    const [calledUrl, init] = fn.mock.calls[0];
    expect(calledUrl).toBe(URL_);
    // Timeout-Fix vom 2026-08-31: der Export-Abruf trägt IMMER ein AbortSignal.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Mozilla');
  });

  it('akzeptiert JSON auch ohne json-Content-Type, wenn der Body wie JSON aussieht', async () => {
    stubFetch(
      async () => new Response('[1,2]', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    expect(await fetchJsonExport(URL_)).toEqual([1, 2]);
  });
});
