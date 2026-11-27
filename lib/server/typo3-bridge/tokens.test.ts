import { describe, it, expect } from 'vitest';
import { bridgeTokensFrom, SHARED_TOKEN_LABEL } from './tokens';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

describe('bridgeTokensFrom', () => {
  it('liest das gemeinsame und die benannten, Komma oder Zeilenumbruch', () => {
    expect(bridgeTokensFrom({ TYPO3_BRIDGE_TOKEN: C, TYPO3_BRIDGE_TOKENS: `extern-1:${A},\n extern-2 : ${B} ,` })).toEqual([
      { label: SHARED_TOKEN_LABEL, secret: C },
      { label: 'extern-1', secret: A },
      { label: 'extern-2', secret: B },
    ]);
  });

  it('nichts gesetzt: leere Liste (Bridge aus)', () => {
    expect(bridgeTokensFrom({})).toEqual([]);
    expect(bridgeTokensFrom({ TYPO3_BRIDGE_TOKEN: '  ', TYPO3_BRIDGE_TOKENS: ' , ' })).toEqual([]);
  });

  it('Token darf einen Doppelpunkt enthalten, getrennt wird am ersten', () => {
    expect(bridgeTokensFrom({ TYPO3_BRIDGE_TOKENS: `x:${A}:${B}` })).toEqual([{ label: 'x', secret: `${A}:${B}` }]);
  });

  it.each([
    ['ohne Doppelpunkt', A, /erwartet „name:token“/],
    ['Name mit Großbuchstaben', `Extern:${A}`, /Name ungültig/],
    ['Name beginnt mit -', `-x:${A}`, /Name ungültig/],
    ['leerer Name', `:${A}`, /Name ungültig/],
    ['Token zu kurz', 'extern-1:kurz', /kürzer als 32/],
    ['Name doppelt', `x:${A},x:${B}`, /Name „x“ doppelt/],
    ['Token doppelt', `x:${A},y:${A}`, /Token schon vergeben/],
    ['Name „gemeinsam“ belegt', `gemeinsam:${A}`, /Name „gemeinsam“ doppelt/],
  ])('wirft bei %s', (_name, raw, msg) => {
    expect(() => bridgeTokensFrom({ TYPO3_BRIDGE_TOKEN: C, TYPO3_BRIDGE_TOKENS: raw })).toThrow(msg);
  });

  it('benanntes Token gleich dem gemeinsamen: Fehler', () => {
    expect(() => bridgeTokensFrom({ TYPO3_BRIDGE_TOKEN: A, TYPO3_BRIDGE_TOKENS: `x:${A}` })).toThrow(/schon vergeben/);
  });

  it('nennt in Fehlern nie ein Token, auch nicht bei vertauschtem „token:name“', () => {
    for (const raw of [A, `${A}:extern-1`, `extern-1:${A},extern-2:${A}`]) {
      try {
        bridgeTokensFrom({ TYPO3_BRIDGE_TOKENS: raw });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toContain(A);
      }
    }
  });
});
