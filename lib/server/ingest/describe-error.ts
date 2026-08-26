// Eine Fehlermeldung, die im Alarm ankommt statt ihn zu sprengen.
//
// ANLASS (Nacht auf den 2026-08-22). Der Publications-Delta lief in den
// Volldump-Guard von apply_publications_delta — ein Einzeiler, der die Ursache
// exakt benennt („2474 publications exceeds max_delta_pubs=2000"). Angekommen
// ist davon nichts. Die Route legte `err.message` in den Feed-Report, und bei
// einem Drizzle-Query-Fehler ist das:
//
//   Failed query: SELECT apply_publications_delta($1::jsonb, $2::jsonb) …
//   params: {"meta":…  <-- das KOMPLETTE 15-MB-Payload
//
// Folgen, alle drei still: der Response-Body wuchs auf 4,7 MB; der VPS-Wrapper
// reichte ihn per argv an `jq` und bekam „Argument list too long", weshalb in
// der einzigen Nacht mit einem echten Problem KEIN Sentry-Event entstand; und
// die Postgres-Meldung selbst war nie enthalten — sie steckt in `err.cause`.
//
// Deshalb hier zwei Regeln: die TIEFSTE Ursache gewinnt (dort sitzt Postgres,
// darueber nur der Wrapper), und die Ausgabe ist hart gedeckelt.

/** Reicht fuer jede Postgres-Meldung inklusive DETAIL; alles darueber ist
 *  Payload-Echo und gehoert nicht in einen Alarm-Titel. */
export const MAX_ERROR_CHARS = 600;

/** Verdichtet einen unbekannten Fehler zu einer alarmtauglichen Zeile. */
export function describeError(err: unknown): string {
  const message = deepestMessage(err) ?? String(err);

  // Drizzle haengt das Payload ab Zeile 2 an („params: …"); Postgres selbst
  // meldet einzeilig. Die erste Zeile ist damit in beiden Faellen die Aussage.
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  const line = firstLine.length > 0 ? firstLine : message.trim();

  return line.length > MAX_ERROR_CHARS
    ? `${line.slice(0, MAX_ERROR_CHARS)}… [gekürzt]`
    : line;
}

/** Laeuft die cause-Kette bis zum Ende und nimmt die letzte echte Meldung.
 *  Zyklen-sicher, weil `cause` prinzipiell auf sich selbst zeigen darf. */
function deepestMessage(err: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = err;
  let deepest: string | null = null;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      deepest = message;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return deepest;
}
