// Gemeinsame Bootstrap-Präambel für die CLI-Skripte (Architektur-Audit #15).
//
// Vorher trug jedes Skript dieselben ~5 kopierten Zeilen — teils ohne Sentry,
// teils ohne confirmProd-Anschluss. Hier steht die eine, konsistente Fassung:
//
//   1. Flags parsen (parseScriptArgs: --target=local|prod, --yes, …).
//   2. .env.local laden (shell-gesetzte Variablen gewinnen, wie überall im
//      Projekt — process.loadEnvFile überschreibt vorhandene process.env nicht).
//   3. Sentry initialisieren (NACH dem Env-Load, braucht SENTRY_DSN; ohne DSN
//      fail-open/inert — lokale Läufe brauchen keinen Sentry-Account).
//   4. DATABASE_URL hart auf das Ziel setzen. Für prod schlägt das jeden in
//      der Shell hängengebliebenen Wert — sonst würde `--target=prod` still
//      lokal schreiben (bzw. umgekehrt).
//
// WICHTIG (bekannte Falle): confirmProd() zeigt über redactedDatabaseUrl()
// den Inhalt von process.env.DATABASE_URL an. Deshalb setzt der Bootstrap
// DATABASE_URL, BEVOR irgendein Aufrufer confirmProd erreichen kann — sonst
// stünde in der Rückfrage die DB aus .env.local (also die LOKALE), während in
// Wahrheit auf Prod geschrieben wird. Gleiche Zeile wie in
// scripts/session-pipeline.ts resolveTarget().
//
// Verwendung (ersetzt die frühere Präambel 1:1, Verhalten identisch):
//
//   import { bootstrapScript, redactedDatabaseUrl,
//            captureScriptError, flushAndExit } from './lib/bootstrap';
//   const { target, isProd, flags, confirmProd } = bootstrapScript('mein-skript');
//   ...
//   await confirmProd('mein-skript');   // fragt nur bei Prod ohne --yes
//
// Drizzle-Konsumenten müssen ihre App-Module weiterhin DYNAMISCH nach dem
// Bootstrap importieren (lib/server/db liest DATABASE_URL beim Modul-Load) —
// das kann keine Lib erzwingen, der Hinweis bleibt am Call-Site-Kommentar.
//
// NICHT für scripts/session-pipeline.ts: das hat mit PG_DATABASE_URL-Override
// und eigenem describeTarget() einen bewusst reicheren Auflösungs-Pfad.

import {
  loadDbUrl,
  parseScriptArgs,
  confirmProd as confirmProdRaw,
  redactedDatabaseUrl,
} from './db.mjs';
import {
  initScriptSentry,
  captureScriptError,
  flushAndExit,
} from './sentry.mjs';

export interface ScriptContext {
  target: 'local' | 'prod';
  isProd: boolean;
  /** Rohe argv-Flags (alles ab argv[2]) — für skriptspezifische Flags wie
   *  --file=…, --limit=…, --apply, --force. */
  flags: string[];
  /** confirmProd mit gebundenem isProd/flags: interaktive Rückfrage vor einem
   *  Prod-Write, No-op für local oder mit --yes. DATABASE_URL ist zu diesem
   *  Zeitpunkt garantiert gesetzt (s. Kopfkommentar). */
  confirmProd: (label: string) => Promise<void>;
}

/** Führt die vier Präambel-Schritte aus (Flags → Env → Sentry → DATABASE_URL)
 *  und gibt den Skript-Kontext zurück. Einmal pro Skript, ganz oben aufrufen. */
export function bootstrapScript(scriptName: string): ScriptContext {
  const { target, flags } = parseScriptArgs() as {
    target: 'local' | 'prod';
    flags: string[];
  };
  const isProd = target === 'prod';

  process.loadEnvFile('.env.local');
  initScriptSentry(scriptName);
  // MUSS vor jedem confirmProd stehen — siehe Falle im Kopfkommentar.
  process.env.DATABASE_URL = loadDbUrl(target);

  return {
    target,
    isProd,
    flags,
    confirmProd: (label: string) => confirmProdRaw({ isProd, flags, label }),
  };
}

// Bequemlichkeits-Re-Exports, damit die Skripte eine einzige Import-Quelle
// haben. Die Implementierungen bleiben in db.mjs/sentry.mjs (geteilt mit den
// .mjs-Skripten, die kein TS importieren können).
export { redactedDatabaseUrl, captureScriptError, flushAndExit };
