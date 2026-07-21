import { describe, it, expect } from 'vitest';
import {
  checkSocialWindowOrder,
  SOCIAL_WINDOW_DEFAULTS,
  SOCIAL_WINDOW_LABELS,
  SOCIAL_WINDOW_ORDER,
  type SocialWindows,
} from './social-windows';

// Die Kette abgerufen ⊇ ausgewertet ⊇ frisch. Diese Regel hat drei Leser
// (Settings-Formular, Server-Merge in lib/server/social/settings.ts und die
// CHECK-Bedingung aus 20260721000003); getestet wird sie einmal, hier.

const w = (fetch: number, theme: number, fresh: number): SocialWindows => ({
  fetch_window_days: fetch,
  theme_window_days: theme,
  fresh_window_days: fresh,
});

describe('checkSocialWindowOrder', () => {
  it('lässt die Vorgabewerte durch', () => {
    expect(checkSocialWindowOrder(SOCIAL_WINDOW_DEFAULTS)).toBeNull();
  });

  it('lässt drei gleiche Werte durch (die Kette darf entartet sein)', () => {
    expect(checkSocialWindowOrder(w(30, 30, 30))).toBeNull();
  });

  it('beanstandet eine Auswertung über den Abrufzeitraum hinaus', () => {
    // Der Fall, den vorher niemand verhindert hat: 30 Tage auswerten, aber nur
    // 14 abrufen — das Lagebild sähe still weniger, als es verspricht.
    const msg = checkSocialWindowOrder(w(14, 30, 7));
    expect(msg).toContain(SOCIAL_WINDOW_LABELS.theme_window_days);
    expect(msg).toContain(SOCIAL_WINDOW_LABELS.fetch_window_days);
    expect(msg).toContain('30');
    expect(msg).toContain('14');
  });

  it('beanstandet eine Frisch-Markierung über dem Auswertungszeitraum', () => {
    const msg = checkSocialWindowOrder(w(30, 7, 14));
    expect(msg).toContain(SOCIAL_WINDOW_LABELS.fresh_window_days);
    expect(msg).toContain(SOCIAL_WINDOW_LABELS.theme_window_days);
  });

  it('meldet die äußerste Verletzung zuerst, damit man von oben nach unten repariert', () => {
    // Beide Stufen verletzt: erst der Abrufzeitraum, dann die Anzeige.
    expect(checkSocialWindowOrder(w(7, 30, 60))).toContain(
      SOCIAL_WINDOW_LABELS.fetch_window_days,
    );
  });

  it('nennt in der Meldung die Beschriftung des Feldes daneben', () => {
    // Die Meldung erscheint im Formular UND als 400-Antwort; sie muss dieselben
    // Wörter benutzen wie die Labels, sonst sucht man das falsche Feld.
    const msg = checkSocialWindowOrder(w(14, 30, 7))!;
    for (const field of SOCIAL_WINDOW_ORDER) {
      if (msg.includes(SOCIAL_WINDOW_LABELS[field])) {
        expect(SOCIAL_WINDOW_LABELS[field]).not.toBe(field);
      }
    }
    expect(msg.endsWith('.')).toBe(true);
  });
});
