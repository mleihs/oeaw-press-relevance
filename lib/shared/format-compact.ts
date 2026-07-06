// Kompakte Kennzahlen im Social-Stil (Likes, Aufrufe, Follower): „950",
// „1,5k", „2,3M". Vereinheitlicht die früheren Duplikate (formatK in
// dashboard-client vs. Intl-compact „1,5 Tsd." in post-card/social-dashboard/
// references-section) auf EINE Schreibweise — Cleanup-Backlog 2026-07-06.

function trimmed(x: number): string {
  return x.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${trimmed(n / 1_000_000)}M`;
  if (n >= 1000) return `${trimmed(n / 1000)}k`;
  return n.toLocaleString('de-AT');
}
