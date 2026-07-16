import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kein echtes Postgres: wir mocken den postgres-js-Client. `reserve()` liefert
// eine „Connection" (Tagged-Template-Funktion + .release()), deren
// pg_try_advisory_lock-Antwort wir pro Test steuern.
const h = vi.hoisted(() => {
  let lockedResult = true;
  const release = vi.fn();
  const conn = Object.assign(
    (strings: TemplateStringsArray) => {
      const q = strings.join('');
      if (q.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ locked: lockedResult }]);
      }
      return Promise.resolve([]); // unlock etc.
    },
    { release },
  );
  const reserve = vi.fn(async () => conn);
  return {
    conn,
    reserve,
    release,
    setLocked(v: boolean) {
      lockedResult = v;
    },
  };
});

vi.mock('postgres', () => ({
  default: () => ({ reserve: h.reserve }),
}));

import { acquireRunLock, withRunLock, RunLockBusyError } from './run-lock';

beforeEach(() => {
  h.reserve.mockClear();
  h.release.mockClear();
  h.setLocked(true);
});

describe('acquireRunLock / withRunLock', () => {
  it('acquires the advisory lock and releases lock + connection', async () => {
    const handle = await acquireRunLock('score:test-a');
    expect(h.reserve).toHaveBeenCalledOnce();

    await handle.release();
    expect(h.release).toHaveBeenCalledOnce();

    // release() ist idempotent.
    await handle.release();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('throws RunLockBusyError and frees the connection when the pg lock is held', async () => {
    h.setLocked(false);
    await expect(acquireRunLock('score:test-b')).rejects.toBeInstanceOf(RunLockBusyError);
    // Fehlgeschlagenes Acquire gibt die reservierte Connection sofort zurück.
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('rejects a second concurrent run of the same key WITHOUT reserving again (in-memory guard)', async () => {
    const handle = await acquireRunLock('score:test-c');
    h.reserve.mockClear();

    await expect(acquireRunLock('score:test-c')).rejects.toBeInstanceOf(RunLockBusyError);
    expect(h.reserve).not.toHaveBeenCalled();

    // Nach Freigabe ist der Key wieder nehmbar.
    await handle.release();
    const again = await acquireRunLock('score:test-c');
    expect(h.reserve).toHaveBeenCalledOnce();
    await again.release();
  });

  it('withRunLock releases the lock even when fn throws', async () => {
    await expect(
      withRunLock('score:test-d', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('withRunLock returns fn result on success', async () => {
    const result = await withRunLock('score:test-e', async () => 42);
    expect(result).toBe(42);
    expect(h.release).toHaveBeenCalledOnce();
  });
});
