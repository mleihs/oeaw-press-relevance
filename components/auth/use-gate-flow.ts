'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Zustand + Logik des Übergangszugangs (gemeinsames Team-Passwort, nur
 * variant="gate") — mechanisch aus auth-screen.tsx herausgelöst; das Markup
 * bleibt dort und konsumiert die Rückgabewerte 1:1. Mit AuthScreen geteilt
 * sind nur die Aufbau-Phase (phase/setPhase) und finishAuth — beides kommt
 * als Parameter herein und bleibt dort verankert.
 */

// localStorage-Schlüssel fürs gemerkte Übergangs-Passwort (geteiltes
// Team-Passwort, reiner Komfort — siehe Kommentar am rememberedGateRef).
// Exportiert, weil auch der Boot-Effekt und das Merken-Checkbox-Markup in
// auth-screen.tsx darauf zugreifen.
export const GATE_REMEMBER_KEY = 'oeaw:gate-remember';

// Auto-Login-Countdown bei gemerktem Passwort (nie ungefragt, mit Abbrechen —
// Best-Practice-Muster „auto-resume with cancel"). Taktet auch den
// Fortschrittsbalken im Markup (auth-screen.tsx).
export const AUTO_MS = 6000;

export function useGateFlow({
  phase,
  setPhase,
  finishAuth,
}: {
  phase: 'boot' | 'auto' | 'ready';
  setPhase: (phase: 'boot' | 'auto' | 'ready') => void;
  finishAuth: (identity: boolean) => void;
}) {
  // Übergangszugang (nur variant="gate")
  const [gatePw, setGatePw] = useState('');
  const [showGatePw, setShowGatePw] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNonce, setGateNonce] = useState(0);
  const [rememberGate, setRememberGate] = useState(false);

  const gatePwRef = useRef<HTMLInputElement>(null);
  // Gemerktes Übergangs-Passwort: in einem Ref gehalten, damit der Lade-Effekt
  // KEIN synchrones setState braucht (Cascading-Render-Warnung). Der
  // Auto-Login liest direkt daraus; sichtbar vorbefüllt wird das Feld erst
  // beim Abbrechen. Bewusst localStorage: geteiltes Team-Passwort (kein
  // persönliches Geheimnis), internes Tool — reiner Komfort.
  const rememberedGateRef = useRef<string | null>(null);

  // Auto-Login-Countdown: nach der Intro startet bei gemerktem Passwort ein
  // Timer, der das Übergangs-Login auslöst. Wechselt phase auf 'ready'
  // (Abbrechen / Feld-Interaktion), räumt die Cleanup den Timer ab.
  useEffect(() => {
    if (phase !== 'auto') return;
    const t = setTimeout(() => {
      void handleGate();
    }, AUTO_MS);
    return () => clearTimeout(t);
    // handleGate schließt über das bereits geladene gatePw; nur an phase hängen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleGate(e?: React.FormEvent) {
    e?.preventDefault();
    if (gateBusy) return;
    // Auto-Login nutzt das gemerkte Passwort aus dem Ref (Feld bleibt leer).
    const usingRemembered = !gatePw && !!rememberedGateRef.current;
    const pw = gatePw || rememberedGateRef.current || '';
    if (!pw) {
      setPhase('ready');
      setGateError('Bitte das gemeinsame Passwort eingeben.');
      setGateNonce((n) => n + 1);
      return;
    }
    setGateBusy(true);
    setGateError(null);
    try {
      const res = await fetch('/api/auth/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        // Stale gemerktes Passwort (Gate-Passwort geändert): verwerfen und
        // zurück aufs Formular, damit man es neu eingeben kann.
        if (usingRemembered) {
          try {
            localStorage.removeItem(GATE_REMEMBER_KEY);
          } catch {
            /* localStorage gesperrt — nichts zu tun. */
          }
          rememberedGateRef.current = null;
          setRememberGate(false);
        }
        setGateError('Das gemeinsame Passwort ist nicht korrekt.');
        setGateNonce((n) => n + 1);
        setGatePw('');
        setPhase('ready');
        return;
      }
      // Merken erst nach erfolgreicher Anmeldung persistieren (kein falsches
      // Passwort im Storage). Auto-Login-Fall bleibt gemerkt.
      try {
        if (rememberGate || usingRemembered) localStorage.setItem(GATE_REMEMBER_KEY, pw);
        else localStorage.removeItem(GATE_REMEMBER_KEY);
      } catch {
        /* localStorage gesperrt — ohne Merken weiter. */
      }
      finishAuth(false);
    } catch {
      setGateError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      setGateNonce((n) => n + 1);
      setPhase('ready');
    } finally {
      setGateBusy(false);
    }
  }

  return {
    gatePw,
    setGatePw,
    showGatePw,
    setShowGatePw,
    gateBusy,
    gateError,
    setGateError,
    gateNonce,
    rememberGate,
    setRememberGate,
    gatePwRef,
    rememberedGateRef,
    handleGate,
  };
}
