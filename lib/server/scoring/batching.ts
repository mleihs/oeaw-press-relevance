// Batch-Schnitt und Zuordnung der Modellantworten, rein und ohne DB.
//
// ZWILLINGE. Dieselbe Veranstaltung steht oft zweimal im Export (Sprachversion,
// Kopie). Damit das Modell beide gleich bewertet, müssen sie im SELBEN Aufruf
// landen; der Adapter schreibt dann einen Hinweis in den Prompt. Ein Schnitt
// stur alle fünf Einträge würde ein Paar an der Grenze trennen.
//
// ZUORDNUNG. Die alten Runner ordneten die n-te Antwort dem n-ten Eintrag zu.
// Lässt das Modell eine Bewertung aus, rutscht alles danach um eins: der Pitch
// von B landet bei C, und niemand sieht es. Die Rubriken verlangen deshalb
// publication_index / event_index, und der Kern ordnet danach zu.

/**
 * Schneidet `items` in Stücke von höchstens `size`, ohne eine Gruppe zu
 * zerreißen: die vorhandenen Mitglieder einer Gruppe stehen zusammen, an der
 * Stelle ihres ersten Mitglieds. Eine Gruppe, die allein größer als `size` ist,
 * wird am Stück geschnitten. Ohne Gruppen ist das ein schlichter Schnitt.
 */
export function partitionKeepingGroups<T extends { id: string }>(
  items: readonly T[],
  size: number,
  groups: readonly string[][] = [],
): T[][] {
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.forEach((id) => groupOf.set(id, gi)));

  const units: T[][] = [];
  const placed = new Set<number>();
  for (const item of items) {
    const gi = groupOf.get(item.id);
    if (gi === undefined) {
      units.push([item]);
    } else if (!placed.has(gi)) {
      placed.add(gi);
      units.push(items.filter((x) => groupOf.get(x.id) === gi));
    }
  }

  const out: T[][] = [];
  let current: T[] = [];
  for (const unit of units) {
    if (unit.length > size) {
      if (current.length > 0) out.push(current);
      current = [];
      for (let i = 0; i < unit.length; i += size) out.push(unit.slice(i, i + size));
      continue;
    }
    if (current.length + unit.length > size) {
      out.push(current);
      current = [];
    }
    current.push(...unit);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Je Gruppe nur das erste vorhandene Mitglied, alle übrigen Einträge
 * unverändert, Reihenfolge bleibt. Für die chunkweiten Prüfungen: Zwillinge
 * dürfen gleich klingen, ihre gleichen Schlüsse sind keine Monotonie.
 */
export function oneOfEachGroup<T extends { id: string }>(items: readonly T[], groups: readonly string[][]): T[] {
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.forEach((id) => groupOf.set(id, gi)));
  const seen = new Set<number>();
  return items.filter((item) => {
    const gi = groupOf.get(item.id);
    if (gi === undefined) return true;
    if (seen.has(gi)) return false;
    seen.add(gi);
    return true;
  });
}

/** 1-basierte Positionen der Gruppen, von denen mindestens zwei im Batch stehen. */
export function twinPositions(batch: readonly { id: string }[], groups: readonly string[][]): number[][] {
  const position = new Map(batch.map((item, i) => [item.id, i + 1]));
  return groups
    .map((g) => g.flatMap((id) => position.get(id) ?? []).sort((a, b) => a - b))
    .filter((p) => p.length >= 2);
}

export type Pairing = 'index' | 'position' | 'none';

/**
 * Ordnet Antworten Einträgen zu. Über den gemeldeten Index, wenn jede Antwort
 * einen gültigen und eindeutigen trägt (fehlende Einträge bleiben dann eben
 * ohne Bewertung); sonst nach Position, aber nur bei gleicher Anzahl; sonst
 * gar nicht. Lieber einen Batch verlieren als Texte vertauschen.
 */
export function pairResults<TItem, TResult>(
  batch: readonly TItem[],
  results: readonly TResult[],
  indexOf: (result: TResult) => number | undefined,
): { pairs: Array<{ item: TItem; result: TResult }>; via: Pairing } {
  const indices = results.map(indexOf);
  const byIndex =
    results.length > 0 &&
    indices.every((i) => Number.isInteger(i) && (i as number) >= 1 && (i as number) <= batch.length) &&
    new Set(indices).size === indices.length;
  if (byIndex) {
    return { pairs: results.map((result, k) => ({ item: batch[(indices[k] as number) - 1], result })), via: 'index' };
  }
  if (results.length === batch.length) {
    return { pairs: results.map((result, k) => ({ item: batch[k], result })), via: 'position' };
  }
  return { pairs: [], via: 'none' };
}
