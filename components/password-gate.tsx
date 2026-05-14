'use client';

import { useState, useEffect, useRef } from 'react';
import { CapybaraGlitch } from '@/components/capybara-glitch';
import { AUTH_STORAGE_KEY, AUTH_SUCCESS_EVENT } from '@/lib/client/auth-events';

// G1: Real auth via /api/auth/gate. The server compares against GATE_PASSWORD
// (env-side only) and sets an HttpOnly cookie that the middleware checks on
// every subsequent request. The password never lives in client JS anymore;
// the only client responsibility is collecting it from the input.

export function PasswordGate({ children }: { children: React.ReactNode }) {
  // Local-dev bypass: skip the gate UI entirely. The server middleware is
  // already pass-through when GATE_TOKEN isn't set (typical .env.local
  // omits it). DevPassthrough still seeds the session marker + auth-event
  // so post-auth consumers (e.g. dashboard's daily glitch) behave as if
  // the user came through the gate normally. To re-test the gate locally,
  // comment out this branch temporarily.
  if (process.env.NODE_ENV === 'development') {
    return <DevPassthrough>{children}</DevPassthrough>;
  }

  return <RealGate>{children}</RealGate>;
}

function DevPassthrough({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
    window.dispatchEvent(new CustomEvent(AUTH_SUCCESS_EVENT));
  }, []);
  return <>{children}</>;
}

function RealGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_STORAGE_KEY) === '1') {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!authenticated && !checking && inputRef.current) {
      inputRef.current.focus();
    }
  }, [authenticated, checking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
        setAuthenticated(true);
        window.dispatchEvent(new CustomEvent(AUTH_SUCCESS_EVENT));
      } else {
        setError(true);
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        setTimeout(() => setError(false), 2000);
      }
    } catch {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  if (checking) {
    return null;
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Blurred app content behind. `inert` blocks ALL keyboard/AT
          interaction (W6) without this, sighted-keyboard and AT users
          could tab through the ghost UI behind the gate. */}
      <div
        className="blur-md pointer-events-none select-none opacity-40"
        aria-hidden
        inert
      >
        {children}
      </div>

      {/* Gate overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f5f3ef]/80 dark:bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center w-full max-w-lg px-6">
          {/* Capybara boot sequence. Always plays on every gate-mount (the
              gate only mounts when unauthenticated, so it's effectively
              once-per-session). */}
          <CapybaraGlitch
            oldSrc="/capybara-gate-alpha.png"
            cyberSrc="/capybara-gate-cyber-alpha.png"
            oldAlt="Capybara-Türsteher vor der ÖAW"
            cyberAlt="Capybara-Türsteher, Cyber-Edition"
            play={true}
            className="w-full max-w-md aspect-[16/10] mb-6"
            priority
          />

          {/* Password form, minimal sketch-aesthetic */}
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
            <div className={`relative ${shaking ? 'animate-shake' : ''}`}>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Passwort eingeben..."
                className={`w-full rounded-none border-0 border-b-2 bg-transparent px-1 py-2.5 text-center text-lg tracking-wide placeholder:text-muted-foreground/70 focus:outline-none transition-colors ${
                  error
                    ? 'border-red-400 text-red-600 dark:text-red-400'
                    : 'border-border text-foreground focus:border-foreground'
                }`}
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                autoComplete="off"
              />
            </div>

            {error && (
              <p
                className="text-center text-sm text-red-500"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Falsches Passwort.
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-md border-2 border-foreground bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '0.05em' }}
            >
              Eintreten
            </button>
          </form>

          {/* Subtle branding */}
          <p
            className="mt-8 text-xs text-muted-foreground/70 tracking-widest uppercase"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Story Scout &middot; ÖAW
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-shake { animation: none !important; }
        }
      `}</style>
    </>
  );
}
