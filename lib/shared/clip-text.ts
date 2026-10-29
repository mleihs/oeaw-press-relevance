// Kürzt auf höchstens `n` UTF-16-Einheiten, ohne ein Surrogatpaar (Emoji) zu
// halbieren. Ein einzelnes High-Surrogate am Schnitt macht den Request-Body für
// Anthropic ungültig („unexpected end of hex escape“) und kippte am 2026-10-29
// die Themenübersicht des Social-Refreshs.
export function clipText(s: string, n: number, ellipsis = ''): string {
  if (s.length <= n) return s;
  const code = s.charCodeAt(n - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? n - 1 : n;
  return s.slice(0, end) + ellipsis;
}
