import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { signImpersonationOrigin, readImpersonationOrigin } from './impersonation';

// Signierter Herkunfts-Cookie des Nutzer-Switchers: die HMAC-Grenze ist das,
// was einen Member daran hindert, sich per selbstgebasteltem Cookie zum
// „Herkunfts-Admin" zu erklären. Pure Krypto-Logik — kein DB/Cookie-Store.

const ADMIN_ID = '11111111-2222-3333-4444-555555555555';
const KEY = 'service-role-key-fuer-tests';

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
});

describe('signImpersonationOrigin / readImpersonationOrigin', () => {
  it('Roundtrip: signierter Wert liest zurück auf die Admin-UUID', () => {
    const value = signImpersonationOrigin(ADMIN_ID);
    expect(value.startsWith(`${ADMIN_ID}.`)).toBe(true);
    expect(readImpersonationOrigin(value)).toBe(ADMIN_ID);
  });

  it('manipulierte MAC → null (Fälschung fällt durch)', () => {
    const value = signImpersonationOrigin(ADMIN_ID);
    const flipped = value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
    expect(readImpersonationOrigin(flipped)).toBeNull();
  });

  it('ausgetauschte Id mit fremder (gültiger) MAC → null', () => {
    // Ein Member kopiert die MAC eines echten Cookies und hängt seine
    // eigene UUID davor — die MAC deckt die Id, das darf nicht lesen.
    const otherId = '99999999-8888-7777-6666-555555555555';
    const mac = signImpersonationOrigin(ADMIN_ID).split('.').pop()!;
    expect(readImpersonationOrigin(`${otherId}.${mac}`)).toBeNull();
  });

  it('mit anderem Schlüssel signierter Wert → null', () => {
    const foreignMac = createHmac('sha256', 'anderer-schluessel')
      .update(ADMIN_ID)
      .digest('hex');
    expect(readImpersonationOrigin(`${ADMIN_ID}.${foreignMac}`)).toBeNull();
  });

  it('MAC falscher Länge → null statt timingSafeEqual-Throw', () => {
    expect(readImpersonationOrigin(`${ADMIN_ID}.abc`)).toBeNull();
  });

  it('degenerierte Werte → null: leer, undefined, ohne Punkt, führender Punkt', () => {
    expect(readImpersonationOrigin('')).toBeNull();
    expect(readImpersonationOrigin(undefined)).toBeNull();
    expect(readImpersonationOrigin(null)).toBeNull();
    expect(readImpersonationOrigin('kein-punkt')).toBeNull();
    expect(readImpersonationOrigin('.nur-mac')).toBeNull();
  });

  it('UUIDs mit Punkt-freiem Format: lastIndexOf trennt am MAC-Punkt', () => {
    // Defensive: selbst wenn die Id einen Punkt enthielte, gewinnt der letzte.
    const weird = 'a.b';
    const value = signImpersonationOrigin(weird);
    expect(readImpersonationOrigin(value)).toBe(weird);
  });
});
