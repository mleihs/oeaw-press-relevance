/**
 * Initialpasswort-Generator für admin-angelegte Konten (BOARD_PLAN.md §3.1:
 * kein SMTP auf dem Free Tier — das Passwort wird persönlich weitergegeben).
 * Läuft im Browser (Anlegen-Formular) und in Node (Passwort-Reset-Route),
 * daher Web-Crypto (`globalThis.crypto`) statt node:crypto.
 */

// Ohne verwechselbare Zeichen (0/O, 1/l/I) — das Passwort wird mündlich
// oder handschriftlich weitergegeben.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * `xxxx-xxxx-xxxx`: 12 Zeichen aus 54 ≈ 69 bit Entropie. Der Modulo-Bias
 * von `Uint32 % 54` liegt unter 2^-25 pro Zeichen — kryptographisch
 * irrelevant für diesen Zweck.
 */
export function generatePassword(groups = 3, groupLength = 4): string {
  const values = new Uint32Array(groups * groupLength);
  globalThis.crypto.getRandomValues(values);
  const chars = Array.from(values, (v) => ALPHABET[v % ALPHABET.length]);
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    parts.push(chars.slice(g * groupLength, (g + 1) * groupLength).join(''));
  }
  return parts.join('-');
}
