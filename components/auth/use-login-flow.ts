'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/client/query-keys';
import type { CurrentUser } from '@/lib/shared/types';

/**
 * Zustand + Logik des persönlichen Logins (E-Mail + Passwort) — mechanisch
 * aus auth-screen.tsx herausgelöst; das Markup bleibt dort und konsumiert die
 * Rückgabewerte 1:1. Mit AuthScreen geteilt ist nur finishAuth (kommt als
 * Parameter herein); mit dem Gate-Flow teilt dieser Flow keinen State.
 */
export function useLoginFlow({ finishAuth }: { finishAuth: (identity: boolean) => void }) {
  const queryClient = useQueryClient();

  // Persönlicher Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errNonce, setErrNonce] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Bitte E-Mail und Passwort eingeben.');
      setErrNonce((n) => n + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Anmeldung fehlgeschlagen.');
        setErrNonce((n) => n + 1);
        setPassword('');
        return;
      }
      queryClient.setQueryData<CurrentUser | null>(QK.currentUser, body.user ?? null);
      finishAuth(true);
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      setErrNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPw,
    setShowPw,
    busy,
    error,
    setError,
    errNonce,
    emailRef,
    handleLogin,
  };
}
