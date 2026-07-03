'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/client/query-keys';
import type { CurrentUser } from '@/lib/shared/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, LogIn, LockKeyhole, Mail } from 'lucide-react';

/**
 * Anmelde-Screen (Design: docs/design/board/Redaktionsboard.dc.html
 * „LOGIN"). Liegt HINTER dem Passwort-Gate (Gate = äußere Hülle, Auth =
 * Identität; BOARD_PLAN.md §3.1) und legt sich als Vollbild-Overlay über
 * das App-Layout, wie im Design (fixed inset-0 über der Nav).
 */

/** Nur same-origin-Pfade als Redirect-Ziel akzeptieren (kein `//evil`). */
function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) {
      setError('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setPending(true);
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
        setPassword('');
        return;
      }
      queryClient.setQueryData<CurrentUser | null>(QK.currentUser, body.user ?? null);
      router.replace(safeNextPath(searchParams.get('next')));
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-muted p-6 pt-20 dark:bg-background sm:pt-28">
      {/* Brand-Band oben, wie im Design; Titel liegt darauf */}
      <div className="absolute inset-x-0 top-0 h-56 bg-brand" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <span className="text-xl font-semibold tracking-tight">Science Propaganda Ninja</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-xl">
          <h1 className="text-xl font-bold tracking-tight">Anmelden</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Redaktions-Toolkit der Kommunikationsabteilung
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">E-Mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="vorname.nachname@oeaw.ac.at"
                  className="pl-9"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Passwort</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Anmelden
            </Button>
          </form>

          <p className="mt-5 border-t border-border/60 pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Zugänge vergibt die Kommunikationsleitung.
            <br />
            Passwort vergessen? Admin kontaktieren.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams braucht im App Router eine Suspense-Grenze.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
