// Gehärteter Fetch für die OeAW-JSON-Exporte (publications_incremental_change_2,
// event_news_grouped). Beide liegen hinter einer Cloudflare Managed Challenge
// (cf-mitigated: challenge, HTTP 403 auf serverseitiges fetch). Statt eines
// kryptischen „Unexpected token <" tief im Parser liefert dieser Helper eine
// klare, diagnostizierbare Fehlermeldung, wenn statt JSON eine Challenge-/HTML-
// Seite zurückkommt — wichtig für den unbeaufsichtigten VPS-Cron.
//
// Das eigentliche Überwinden der Challenge (WAF-Ausnahme OeAW-seitig bevorzugt,
// alternativ FlareSolverr) ist eine Infra-Entscheidung; dieser Helper macht das
// Scheitern nur eindeutig.

const BROWSERISH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
};

export class ExportFetchError extends Error {
  constructor(
    message: string,
    readonly detail: { url: string; status?: number; cfMitigated?: string | null; bodyHead?: string },
  ) {
    super(message);
    this.name = 'ExportFetchError';
  }
}

/** Fetch a JSON export, failing loudly on a Cloudflare challenge / non-JSON body.
 *  Returns the parsed JSON (unknown — validate with an adapter). */
export async function fetchJsonExport(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSERISH_HEADERS, redirect: 'follow' });
  } catch (err) {
    throw new ExportFetchError(`network error fetching ${url}: ${(err as Error).message}`, { url });
  }

  const cfMitigated = res.headers.get('cf-mitigated');
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();
  const bodyHead = body.slice(0, 200);

  if (cfMitigated) {
    throw new ExportFetchError(
      `Cloudflare challenge at ${url} (cf-mitigated: ${cfMitigated}, HTTP ${res.status}). ` +
        `The export is behind bot protection — the server IP needs a WAF exception ` +
        `(or a challenge-solving proxy). First bytes: ${bodyHead}`,
      { url, status: res.status, cfMitigated, bodyHead },
    );
  }
  if (!res.ok) {
    throw new ExportFetchError(`fetch ${url} → HTTP ${res.status}. First bytes: ${bodyHead}`, {
      url,
      status: res.status,
      bodyHead,
    });
  }
  const looksJson =
    contentType.includes('json') || /^\s*[[{]/.test(body);
  if (!looksJson) {
    throw new ExportFetchError(
      `expected JSON from ${url} but got content-type='${contentType}' ` +
        `(likely a Cloudflare/HTML page). First bytes: ${bodyHead}`,
      { url, status: res.status, bodyHead },
    );
  }
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new ExportFetchError(
      `invalid JSON from ${url}: ${(err as Error).message}. First bytes: ${bodyHead}`,
      { url, status: res.status, bodyHead },
    );
  }
}
