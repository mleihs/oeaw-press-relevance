// Gehärteter Fetch für die OeAW-JSON-Exporte (publications_incremental_change_2,
// event_news_grouped). Beide liegen an `www.oeaw.ac.at` hinter einer Cloudflare
// Managed Challenge (cf-mitigated: challenge, HTTP 403 auf serverseitiges fetch).
// Statt eines kryptischen „Unexpected token <" tief im Parser liefert dieser
// Helper eine klare, diagnostizierbare Fehlermeldung, wenn statt JSON eine
// Challenge-/HTML-Seite zurückkommt — wichtig für den unbeaufsichtigten VPS-Cron.
//
// ORIGIN-PIN (Cloudflare-Bypass): Der Origin-Server (voxy.arz.oeaw.ac.at) ist vom
// VPS aus direkt erreichbar und trägt ein gültiges Zertifikat für www.oeaw.ac.at
// (SAN: oeaw.ac.at, www.oeaw.ac.at). Ist `OEAW_EXPORT_ORIGIN_IP` gesetzt, lösen
// wir den Export-Host auf diese IP auf, senden aber SNI + Host unverändert als
// www.oeaw.ac.at — dadurch bleibt die TLS-Validierung intakt (kein -k) und wir
// umgehen den CF-Proxy sauber. Env leer → normaler DNS (durch die Challenge).
// Stabilere Dauerlösung bleibt eine WAF-Ausnahme OeAW-seitig; der Pin ist der
// pragmatische Sofortweg und bei Origin-IP-Wechsel nur eine Env-Änderung.

import { Agent } from 'undici';
import dns from 'node:dns';

const BROWSERISH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
};

/** Host, für den der Origin-Pin gilt (die Export-URLs liegen alle hier). */
const PINNED_HOST = 'www.oeaw.ac.at';

/** undici-Agent, der `PINNED_HOST` auf `OEAW_EXPORT_ORIGIN_IP` auflöst, SNI/Host
 *  aber unverändert lässt (Zert. validiert weiter gegen www.oeaw.ac.at). Andere
 *  Hosts laufen über normalen DNS. `null`, wenn kein Origin-Pin konfiguriert. */
function originPinDispatcher(): Agent | null {
  const ip = process.env.OEAW_EXPORT_ORIGIN_IP?.trim();
  if (!ip) return null;
  const family = ip.includes(':') ? 6 : 4;
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname === PINNED_HOST) {
          if ((options as dns.LookupOptions).all) {
            callback(null, [{ address: ip, family }] as never, undefined as never);
          } else {
            callback(null, ip as never, family as never);
          }
          return;
        }
        dns.lookup(hostname, options as dns.LookupOptions, callback as never);
      },
    },
  });
}

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
  const dispatcher = originPinDispatcher();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSERISH_HEADERS,
      redirect: 'follow',
      // undici-spezifisch, aber vom Node-fetch akzeptiert; kein Effekt ohne Pin.
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
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
