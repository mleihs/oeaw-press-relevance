// Tokens der TYPO3-Bridge (Entscheidung des Nutzers 2026-11-27, nachmittags):
// neben dem gemeinsamen TYPO3_BRIDGE_TOKEN gibt es benannte Tokens, damit
// weitergegebene Zugänge einzeln sperrbar sind und im Log unterscheidbar.
//
//   TYPO3_BRIDGE_TOKEN   ein Token, Name im Log „gemeinsam“
//   TYPO3_BRIDGE_TOKENS  „name:token“, getrennt durch Komma oder Zeilenumbruch,
//                        z. B. „extern-1:<64 hex>,extern-2:<64 hex>“
//
// Sperren: den Eintrag aus TYPO3_BRIDGE_TOKENS nehmen und neu deployen; die
// anderen Tokens bleiben gültig. Rein und ohne Imports, damit env.ts beim
// Booten dieselbe Prüfung fährt wie die Routen (lib/server/typo3-bridge/http.ts).

export interface BridgeToken {
  /** Name im Log (typo3_bridge_request, typo3_bridge_news_assist). */
  label: string;
  secret: string;
}

/** Name des Tokens aus TYPO3_BRIDGE_TOKEN. */
export const SHARED_TOKEN_LABEL = 'gemeinsam';

/** Wie TYPO3_BRIDGE_TOKEN: `openssl rand -hex 32` ergibt 64 Zeichen. */
export const BRIDGE_TOKEN_MIN = 32;

const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * Alle gültigen Tokens aus der Env. Wirft mit deutschem Text bei Formfehlern:
 * Eintrag ohne Doppelpunkt, Name außerhalb [a-z0-9-], Token zu kurz, Name
 * oder Token doppelt (auch gegenüber dem gemeinsamen). Die Texte landen im
 * Boot-Log (env.ts) und nennen deshalb nie ein Token, einen ungültigen Namen
 * auch nicht: vertauscht jemand „token:name“, stünde sonst das Token im Log.
 */
export function bridgeTokensFrom(env: { TYPO3_BRIDGE_TOKEN?: string; TYPO3_BRIDGE_TOKENS?: string }): BridgeToken[] {
  const out: BridgeToken[] = [];
  const shared = env.TYPO3_BRIDGE_TOKEN?.trim();
  if (shared) out.push({ label: SHARED_TOKEN_LABEL, secret: shared });

  const entries = (env.TYPO3_BRIDGE_TOKENS ?? '')
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter(Boolean);
  entries.forEach((entry, i) => {
    const where = `Eintrag ${i + 1}`;
    const colon = entry.indexOf(':');
    if (colon < 0) throw new Error(`${where}: erwartet „name:token“.`);
    const label = entry.slice(0, colon).trim();
    const secret = entry.slice(colon + 1).trim();
    if (!LABEL_RE.test(label)) throw new Error(`${where}: Name ungültig (nur a–z, 0–9 und -, höchstens 40 Zeichen, vorn kein -).`);
    if (secret.length < BRIDGE_TOKEN_MIN) throw new Error(`${where} (${label}): Token kürzer als ${BRIDGE_TOKEN_MIN} Zeichen (openssl rand -hex 32).`);
    if (out.some((t) => t.label === label)) throw new Error(`${where}: Name „${label}“ doppelt.`);
    if (out.some((t) => t.secret === secret)) throw new Error(`${where} (${label}): Token schon vergeben.`);
    out.push({ label, secret });
  });
  return out;
}
