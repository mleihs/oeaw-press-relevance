'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const CORRECT_PASSWORD = 'movefastandbreakthings';
const STORAGE_KEY = 'storyscout-auth';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!authenticated && !checking && inputRef.current) {
      inputRef.current.focus();
    }
  }, [authenticated, checking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setAuthenticated(true);
    } else {
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
      {/* Blurred app content behind */}
      <div className="blur-md pointer-events-none select-none opacity-40" aria-hidden>
        {children}
      </div>

      {/* Gate overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f5f3ef]/80 backdrop-blur-sm">
        <div className="flex flex-col items-center w-full max-w-lg px-6">
          {/* Capybara illustration */}
          <div className="relative w-full max-w-md aspect-[16/10] mb-6">
            <Image
              src="/capybara-gate.png"
              alt="Capybara-Türsteher vor der ÖAW"
              fill
              className="object-contain mix-blend-multiply"
              priority
            />
          </div>

          {/* Password form — minimal, sketch-aesthetic */}
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
            <div className={`relative ${shaking ? 'animate-shake' : ''}`}>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Passwort eingeben..."
                className={`w-full rounded-none border-0 border-b-2 bg-transparent px-1 py-2.5 text-center text-lg tracking-wide placeholder:text-neutral-400 focus:outline-none transition-colors ${
                  error
                    ? 'border-red-400 text-red-600'
                    : 'border-neutral-300 text-neutral-800 focus:border-neutral-600'
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
              className="w-full rounded-md border-2 border-neutral-800 bg-transparent px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-800 hover:text-white"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '0.05em' }}
            >
              Eintreten
            </button>
          </form>

          {/* Subtle branding */}
          <p
            className="mt-8 text-xs text-neutral-400 tracking-widest uppercase"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            StoryScout &middot; ÖAW
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
      `}</style>
    </>
  );
}
