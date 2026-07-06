import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signierter „Herkunfts-Admin"-Cookie für den Nutzer-Switcher (user-switcher).
 *
 * Der Switcher wechselt via service-role in eine fremde, vollwertige Session.
 * Wechselt ein Admin in einen Member, ist die aktive Session danach kein Admin
 * mehr — ohne Merker käme man nicht zurück und der Switcher wäre eine
 * Einbahnstraße. Dieser Cookie hält fest, WER (welcher Admin) die
 * Impersonation gestartet hat, damit
 *   (a) der Switcher während der Impersonation sichtbar/nutzbar bleibt und
 *   (b) „Zurück zu mir" möglich ist.
 *
 * Fälschungssicherheit: HMAC-SHA256 über die Admin-UUID mit dem
 * service-role-Key als Schlüssel (server-only, stabil, immer gesetzt). Ein
 * Member kann den Cookie nicht selbst erzeugen — er wird ausschließlich
 * server-seitig gesetzt, wenn eine *echte* Admin-Session einen Wechsel
 * auslöst (Rolle wird bei jedem Aufruf frisch gegen public.users geprüft).
 */

export const IMPERSONATION_COOKIE = 'imp_origin';

function secret(): string {
  // Gleicher Schlüssel wie der Admin-Client; per env.ts als required validiert.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}

/** `<adminId>.<hmac>` — der signierte Cookie-Wert. */
export function signImpersonationOrigin(adminId: string): string {
  const mac = createHmac('sha256', secret()).update(adminId).digest('hex');
  return `${adminId}.${mac}`;
}

/** Verifiziert den Cookie-Wert und gibt die Admin-UUID zurück, oder null. */
export function readImpersonationOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(id).digest('hex');
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length) return null;
  try {
    return timingSafeEqual(macBuf, expBuf) ? id : null;
  } catch {
    return null;
  }
}
