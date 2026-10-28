// Begrenzte Nebenläufigkeit ohne Zusatzpaket. Geteilt von der Bildablage des
// Social-Moduls (lib/server/social/images.ts), der Batch-Schleife
// (lib/server/llm-batch.ts) und dem Bewertungskern (lib/server/scoring/run.ts,
// Haiku-Nachforderungen). Lag vorher als private Kopie in images.ts.

/**
 * Wendet `fn` auf jedes Element an, mit höchstens `limit` gleichzeitig
 * laufenden Aufrufen. Ergebnisse in Eingabereihenfolge.
 *
 * Wirft `fn`, lehnt das Ganze ab wie Promise.all, und die übrigen Worker
 * nehmen danach kein neues Element mehr an (ihr laufender Aufruf endet noch).
 * Wer trotz Fehlern weiterarbeiten will, fängt in `fn` selbst.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && cursor < items.length) {
      const idx = cursor++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
