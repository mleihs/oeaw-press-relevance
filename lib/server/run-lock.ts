import 'server-only';
import postgres from 'postgres';

// Cross-Instanz-Mutex fürs Relevanz-Scoring über Postgres-Session-Advisory-Locks.
// Zweck: verhindert zwei GLEICHZEITIGE Bewertungsläufe (doppelte OpenRouter-
// Ausgaben + Doppelarbeit), egal ob im selben Prozess oder über zwei Vercel-/
// Coolify-Instanzen. Beide Deployments hängen am Session-Pooler (:5432), also
// sind Session-Advisory-Locks backend-sticky und funktionieren.
//
// WARUM ein DEDIZIERTER Mini-Pool und nicht der Haupt-`db`-Pool: der Haupt-Pool
// läuft mit max:1 (Supavisor-Transaction-Mode / Vercel-Empfehlung). Reservierte
// man dessen einzige Connection für die Dauer eines (minutenlangen) Scoring-
// Laufs, hätte der Lauf keine Connection mehr für seine EIGENEN db.update-
// Schreibzugriffe → Deadlock. Der Lock lebt daher auf einem getrennten kleinen
// Pool. max ≥ Zahl paralleler Lock-Keys (Pubs + Events dürfen gleichzeitig
// laufen), plus etwas Slack. reserve() pinnt pro Aufruf EINE Connection, damit
// Acquire und Unlock auf DERSELBEN Session landen.
//
// Ausblick: eine Lease-Tabelle (row-lock/expiry) wäre ein interner Swap hinter
// derselben API, falls die Advisory-Lock-Semantik am Pooler je bricht.
const lockPool = postgres(process.env.DATABASE_URL ?? '', {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

// In-Memory-Gurt: blockt einen zweiten Lauf DESSELBEN Keys innerhalb einer
// Instanz sofort — BEVOR eine Lock-Connection reserviert wird. Nebeneffekt: er
// verhindert die Re-Entrancy von Session-Advisory-Locks (dieselbe Session könnte
// denselben Lock erneut nehmen und fälschlich „frei" melden). Cross-Instanz
// erledigt der pg_advisory_lock (verschiedene Prozesse = verschiedene Sessions).
const held = new Set<string>();

/** Reservierte Lock-Keys — ein Key pro serialisierbarem Lauf-Typ. */
export const RUN_LOCK_KEYS = {
  scorePublications: 'score:publications',
  scoreEvents: 'score:events',
} as const;

/** Signalisiert einen bereits laufenden Lauf → die Route macht daraus ein 409. */
export class RunLockBusyError extends Error {
  constructor(message = 'Bewertung läuft bereits.') {
    super(message);
    this.name = 'RunLockBusyError';
  }
}

export interface RunLockHandle {
  /** Gibt Lock + Connection frei (idempotent). Im finally des Läufers aufrufen. */
  release(): Promise<void>;
}

/**
 * Versucht, den Lock für `key` zu nehmen. Erfolg → Handle (dessen release() im
 * finally des Hintergrund-Laufs aufgerufen werden MUSS, damit der Lock über die
 * gesamte Lauf-Dauer gehalten wird — nicht nur bis die SSE-Response gebaut ist).
 * Belegt → RunLockBusyError.
 */
export async function acquireRunLock(key: string): Promise<RunLockHandle> {
  if (held.has(key)) throw new RunLockBusyError();

  const conn = await lockPool.reserve();
  let acquired = false;
  try {
    const rows = await conn<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtextextended(${key}, 0)) AS locked`;
    if (!rows[0]?.locked) throw new RunLockBusyError();
    acquired = true;
    held.add(key);

    let released = false;
    return {
      async release() {
        if (released) return;
        released = true;
        held.delete(key);
        try {
          await conn`SELECT pg_advisory_unlock(hashtextextended(${key}, 0))`;
        } catch {
          // Best-effort: das Session-Ende räumt den Lock ohnehin ab.
        }
        conn.release();
      },
    };
  } finally {
    // Fehlgeschlagenes Acquire (belegt / Fehler): Connection sofort zurückgeben.
    if (!acquired) conn.release();
  }
}

/**
 * Bequemer Wrapper für NICHT-streamende Läufe: Lock halten für die Dauer von
 * `fn()`, danach freigeben. (Die SSE-Routen nutzen acquireRunLock direkt, weil
 * ihr Lauf im Hintergrund weiterläuft, nachdem der Handler die Response
 * zurückgegeben hat.)
 */
export async function withRunLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const handle = await acquireRunLock(key);
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}
