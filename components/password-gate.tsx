'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { AuthScreen } from '@/components/auth/auth-screen';
import { AUTH_STORAGE_KEY, AUTH_SUCCESS_EVENT } from '@/lib/client/auth-events';

// sessionStorage auth marker is an external store: it changes via a
// successful gate submit (same tab, AUTH_SUCCESS_EVENT) or another tab
// (native `storage` event). useSyncExternalStore reads it hydration-safely
// so there is no setState-in-effect cycle.
//
// getServerSnapshot returns `true` (optimistic-authenticated): SSR only ever
// runs for requests the middleware already let through (valid gate cookie),
// so rendering the app on the server is safe and matches the common case.
// The client store then reconciles. Returning `false` here instead would
// flash the password gate for one frame on every hard refresh of an
// already-authenticated session; `true` is flash-free for that path and
// only the rare cookie-valid-but-sessionStorage-missing edge briefly shows
// content before the client re-challenges.
function subscribeAuth(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(AUTH_SUCCESS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(AUTH_SUCCESS_EVENT, onChange);
  };
}

function useGateAuth(): boolean {
  return useSyncExternalStore(
    subscribeAuth,
    () => sessionStorage.getItem(AUTH_STORAGE_KEY) === '1',
    () => true,
  );
}

// G1: Real auth via /api/auth/gate bzw. /api/auth/login. The server compares
// against GATE_PASSWORD (env-side only) and sets an HttpOnly cookie that the
// middleware checks on every subsequent request; a personal login sets the
// same cookie server-side. The password never lives in client JS; the only
// client responsibility is collecting it from the input (AuthScreen).

export function PasswordGate({ children }: { children: React.ReactNode }) {
  // Local-dev bypass: skip the gate UI entirely. GATE_TOKEN is a required
  // env var (lib/server/env.ts), so proxy.ts carries a matching NODE_ENV
  // 'development' bypass — both halves of the gate are off together in dev.
  // DevPassthrough still seeds the session marker + auth-event so post-auth
  // consumers (e.g. dashboard's daily glitch) behave as if the user came
  // through the gate normally. To re-test the gate locally, comment out
  // this branch AND the proxy.ts dev bypass temporarily.
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
  const authenticated = useGateAuth();

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <>
      {/* App content behind the gate stays mounted (React-State/Hydration)
          but fully hidden: display:none statt des früheren Blurs, weil der
          neue Vollbild-Screen keinen durchscheinenden Hintergrund braucht —
          und ungeblurrter Inhalt unterhalb des Viewports sonst lesbar wäre.
          `inert` blockiert zusätzlich Keyboard/AT-Interaktion (W6). */}
      <div className="hidden" aria-hidden inert>
        {children}
      </div>

      {/* Vollbild-Anmeldescreen (ersetzt das Capybara-Gate-Overlay).
          AuthScreen setzt bei Erfolg den sessionStorage-Marker und feuert
          AUTH_SUCCESS_EVENT — die Store-Subscription oben rendert die App
          dann in place (bzw. folgt einem ?next=-Deep-Link). */}
      <AuthScreen variant="gate" />
    </>
  );
}
