import { describe, it, expect } from 'vitest';
import { mapPool } from './concurrency';

/** Ein Aufruf, der erst endet, wenn der Test ihn freigibt. */
function gate() {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return { done, release };
}

describe('mapPool', () => {
  it('liefert die Ergebnisse in Eingabereihenfolge', async () => {
    const out = await mapPool([30, 10, 20], 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:30', '1:10', '2:20']);
  });

  it('hält nie mehr als `limit` Aufrufe gleichzeitig offen', async () => {
    let open = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, gate);
    const run = mapPool(gates, 2, async (g) => {
      open++;
      peak = Math.max(peak, open);
      await g.done;
      open--;
    });
    for (const g of gates) {
      await new Promise((r) => setTimeout(r, 0));
      g.release();
    }
    await run;
    expect(peak).toBe(2);
  });

  it('nimmt nach einem Fehler kein neues Element mehr an', async () => {
    const seen: number[] = [];
    await expect(
      mapPool([1, 2, 3, 4, 5], 1, async (n) => {
        seen.push(n);
        if (n === 2) throw new Error('kaputt');
      }),
    ).rejects.toThrow('kaputt');
    expect(seen).toEqual([1, 2]);
  });

  it('kommt mit einer leeren Liste und einem unsinnigen Limit zurecht', async () => {
    await expect(mapPool([], 3, async () => 1)).resolves.toEqual([]);
    await expect(mapPool([1, 2], 0, async (n) => n * 2)).resolves.toEqual([2, 4]);
  });
});
