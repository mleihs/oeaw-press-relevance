'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/client/query-keys';
import type { CurrentUser } from '@/lib/shared/types';
import { AUTH_STORAGE_KEY, AUTH_SUCCESS_EVENT } from '@/lib/client/auth-events';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Key,
  Loader2,
  LockKeyOpen,
  LockKeyhole,
  LogIn,
  Mail,
  Password,
  RadioButton,
  Send,
} from '@/lib/icons';

/**
 * Gemeinsamer Anmelde-Screen (Design: docs/design/claude-design/Login.dc.html).
 * Zwei Einsatzorte mit identischem Look:
 *  - variant="gate": ersetzt das Capybara-Gate als äußere Hülle. Bietet den
 *    persönlichen Login UND den gemeinsamen Übergangszugang (Gate-Passwort).
 *    Der persönliche Login setzt serverseitig auch das Gate-Cookie
 *    (/api/auth/login), sodass ein Schritt reicht.
 *  - variant="login": /login hinter dem Gate (Identität fürs Board). Nur
 *    persönlicher Login — der Übergangszugang brächte hier nichts Neues.
 *
 * Bewusst NICHT umgesetzt aus dem Design: Demo-Zugänge-Kasten (reine
 * Design-Demo, User-Wunsch 2026-07-06), Erstanmeldungs-Passwortwechsel
 * (kein Backend-Flag), „Angemeldet bleiben" (Cookie-Laufzeiten sind fix).
 * Passwort-vergessen bleibt admin-verwaltet (kein Self-Service-Reset,
 * Memory login-page-forgot-password-links): die Ansicht bereitet eine
 * E-Mail an die Administration vor statt einen Reset auszulösen.
 */

// Address behind the "Admin kontaktieren" mailto. Override per deployment via
// NEXT_PUBLIC_ADMIN_CONTACT (inlined at build); falls back to the ÖAW admin.
const ADMIN_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_CONTACT || 'admin@oeaw.ac.at';

/** Nur same-origin-Pfade als Redirect-Ziel akzeptieren: führender `/`,
 *  danach weder `/` noch `\` — URL-Parser normalisieren `\` zu `/`,
 *  `/\evil.com` wäre sonst ein Open Redirect (Security-Review 2026-07-03). */
function safeNextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

type Mode = 'signin' | 'forgot' | 'forgot-sent';

export function AuthScreen({ variant }: { variant: 'gate' | 'login' }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('signin');

  // Persönlicher Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errNonce, setErrNonce] = useState(0);

  // Übergangszugang (nur variant="gate")
  const [gatePw, setGatePw] = useState('');
  const [showGatePw, setShowGatePw] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNonce, setGateNonce] = useState(0);

  // Passwort vergessen
  const [fwEmail, setFwEmail] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const gatePwRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode !== 'signin') return;
    // Gate-Variante: der Übergangszugang ist der primäre Weg → dessen Feld
    // bekommt den Fokus, nicht das gedämpfte Personen-Login-Feld darunter.
    if (variant === 'gate') gatePwRef.current?.focus();
    else emailRef.current?.focus();
  }, [mode, variant]);

  /** Nach erfolgreichem Auth: Session-Marker setzen und weiterleiten.
   *  `identity: true` (persönlicher Login) navigiert IMMER voll — die Seite
   *  wurde ohne Session serverseitig gerendert, erst ein frischer
   *  RSC-Request zeigt session-abhängige Inhalte (z. B. die Board-Kachel).
   *  Nur der Übergangszugang am Gate deckt in place auf
   *  (AUTH_SUCCESS_EVENT → Store-Subscription in password-gate.tsx). */
  function finishAuth(identity: boolean) {
    sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
    const next = safeNextPath();
    if (identity || variant === 'login') {
      // Volle Navigation statt router.replace: die Ziel-RSC soll mit der
      // frischen Session rendern (nextjs16_client_nav_regression).
      window.location.assign(next ?? '/');
      return;
    }
    if (next) {
      window.location.assign(next);
      return;
    }
    window.dispatchEvent(new CustomEvent(AUTH_SUCCESS_EVENT));
  }

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

  async function handleGate(e: React.FormEvent) {
    e.preventDefault();
    if (gateBusy) return;
    if (!gatePw) {
      setGateError('Bitte das Übergangs-Passwort eingeben.');
      setGateNonce((n) => n + 1);
      return;
    }
    setGateBusy(true);
    setGateError(null);
    try {
      const res = await fetch('/api/auth/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePw }),
      });
      if (!res.ok) {
        setGateError('Übergangs-Passwort ist nicht korrekt.');
        setGateNonce((n) => n + 1);
        setGatePw('');
        return;
      }
      finishAuth(false);
    } catch {
      setGateError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      setGateNonce((n) => n + 1);
    } finally {
      setGateBusy(false);
    }
  }

  /** Kein Self-Service-Reset: die Anfrage geht als vorbereitete E-Mail an die
   *  Administration (mailto), die das Passwort in der Nutzerverwaltung setzt. */
  function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent('ÖAW Presse: Passwort zurücksetzen');
    const body = encodeURIComponent(
      `Bitte um Zurücksetzung des Passworts für den Zugang${fwEmail.trim() ? ` ${fwEmail.trim()}` : ''} im Redaktionstoolkit „ÖAW Presse".`,
    );
    window.location.href = `mailto:${ADMIN_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setMode('forgot-sent');
  }

  // force-light: pinnt die --n-*/--brand-*-Tokens auf die Light-Rohwerte
  // (globals.css) — der Screen ist bewusst light-only, auch bei html.dark.
  return (
    <div className="force-light fixed inset-0 z-50 flex overflow-y-auto bg-canvas text-ink" style={{ colorScheme: 'light' }}>
      <BrandPanel />

      {/* ===== Formular-Panel ===== */}
      <div className="flex flex-1 items-center justify-center px-7 py-10">
        <div className="w-full max-w-[392px]">
          {/* Mobile-Logo (Brand-Panel ist unter lg ausgeblendet) */}
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <RadioButton weight="fill" aria-hidden className="h-6 w-6 text-brand" />
            <span className="text-lg font-semibold tracking-tight">ÖAW Presse</span>
          </div>

          {mode === 'signin' && variant === 'gate' && (
            <div className="auth-rise">
              <h2 className="text-[25px] font-bold tracking-tight">Willkommen bei ÖAW Presse</h2>
              <p className="mb-6 mt-2 text-sm text-ink-subtle">
                Melde dich mit dem gemeinsamen Übergangszugang an; vorerst der reguläre Weg ins
                Toolkit.
              </p>

              {/* ===== Übergangszugang — Hero (primär, blau) ===== */}
              <div className="relative overflow-hidden rounded-[16px] border-[1.5px] border-brand-200 bg-[linear-gradient(158deg,#eef5ff,#ffffff_60%)] p-5 shadow-[0_16px_38px_-18px_rgba(0,71,187,.45)]">
                {/* Dekor: weicher blauer Radial-Fleck oben rechts */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(0,71,187,.14),transparent_70%)]"
                />
                <div className="relative">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[linear-gradient(135deg,#2f6ad0,var(--brand-600))] text-white shadow-[0_5px_14px_rgba(0,71,187,.4)]">
                      <LockKeyOpen weight="fill" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">Übergangszugang</span>
                        <span className="rounded-full bg-brand-50 px-2 py-px text-2xs font-semibold text-brand">
                          Aktueller Zugang
                        </span>
                      </div>
                      <div className="mt-px text-2xs text-ink-muted">
                        Gemeinsames Passwort fürs Team
                      </div>
                    </div>
                  </div>
                  <p className="mb-4 text-xs leading-relaxed text-ink-subtle">
                    Bis zur vollständigen Umstellung genügt das gemeinsame Übergangs-Passwort. Es
                    öffnet alle Bereiche{' '}
                    <span className="font-semibold text-ink-soft">außer das Redaktionsboard</span>.
                  </p>

                  {gateError && (
                    <div
                      key={gateNonce}
                      role="alert"
                      className="auth-shake mb-3 flex items-center gap-2 rounded-[9px] border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600"
                    >
                      <AlertCircle weight="fill" className="h-[15px] w-[15px] shrink-0" />
                      {gateError}
                    </div>
                  )}

                  <form onSubmit={handleGate} className="space-y-3">
                    <div className="auth-field">
                      <Password className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                      <input
                        ref={gatePwRef}
                        type={showGatePw ? 'text' : 'password'}
                        aria-label="Gemeinsames Übergangs-Passwort"
                        placeholder="Gemeinsames Übergangs-Passwort"
                        autoComplete="off"
                        value={gatePw}
                        onChange={(e) => {
                          setGatePw(e.target.value);
                          setGateError(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGatePw((v) => !v)}
                        aria-label={showGatePw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                        className="flex p-1 text-ink-muted hover:text-ink-soft"
                      >
                        {showGatePw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                    <button type="submit" disabled={gateBusy} className="auth-btn-primary">
                      {gateBusy ? (
                        <>
                          <Loader2 className="h-[17px] w-[17px] animate-spin" />
                          Anmeldung läuft …
                        </>
                      ) : (
                        <>
                          <LockKeyOpen weight="fill" className="h-[17px] w-[17px]" />
                          Anmelden
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* ===== Persönlicher Login — später, gedämpft ===== */}
              <div className="mt-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-2xs font-semibold tracking-wide text-ink-muted">
                    DEMNÄCHST · PERSÖNLICHER ZUGANG
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <div className="rounded-[14px] border border-line bg-fill/50 p-4">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white text-ink-muted ring-1 ring-line-strong">
                      <LockKeyhole weight="duotone" className="h-[16px] w-[16px]" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink-soft">Persönlicher Login</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-px text-2xs font-semibold text-ink-muted ring-1 ring-line-strong">
                        <Info className="h-3 w-3" /> Bald verfügbar
                      </span>
                    </div>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-ink-muted">
                    Der persönliche Zugang mit deiner ÖAW-Adresse schaltet mit dem Redaktionsboard
                    frei. Dann tragen Kommentare und Zuständigkeiten deinen Namen. Vorerst bitte
                    den Übergangszugang oben nutzen.
                  </p>

                  {error && (
                    <div
                      key={errNonce}
                      role="alert"
                      className="auth-shake mb-3 flex items-center gap-2 rounded-[9px] border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600"
                    >
                      <AlertCircle weight="fill" className="h-[15px] w-[15px] shrink-0" />
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-3">
                    <div className="auth-field bg-white/70">
                      <Mail className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                      <input
                        ref={emailRef}
                        type="email"
                        autoComplete="email"
                        aria-label="E-Mail-Adresse"
                        placeholder="vorname.nachname@oeaw.ac.at"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                      />
                    </div>
                    <div className="auth-field bg-white/70">
                      <LockKeyhole className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                      <input
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        aria-label="Passwort"
                        placeholder="Passwort eingeben"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                        className="flex p-1 text-ink-muted hover:text-ink-soft"
                      >
                        {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-xs font-semibold text-ink-subtle hover:text-brand"
                      >
                        Passwort vergessen?
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-line-strong bg-white px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-fill disabled:opacity-60"
                      >
                        {busy ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Anmeldung läuft …
                          </>
                        ) : (
                          <>
                            <LogIn weight="fill" className="h-4 w-4" />
                            Persönlich anmelden
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {mode === 'signin' && variant === 'login' && (
            <div className="auth-rise">
              <h2 className="text-[25px] font-bold tracking-tight">Willkommen zurück</h2>
              <p className="mb-6 mt-2 text-sm text-ink-subtle">
                Melde dich mit deinem ÖAW-Redaktionszugang an.
              </p>

              {error && (
                <div
                  key={errNonce}
                  role="alert"
                  className="auth-shake mb-4 flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600"
                >
                  <AlertCircle weight="fill" className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-1.5 block text-xs font-semibold text-ink-soft"
                  >
                    E-Mail-Adresse
                  </label>
                  <div className="auth-field">
                    <Mail className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                    <input
                      ref={emailRef}
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      placeholder="vorname.nachname@oeaw.ac.at"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="auth-password" className="text-xs font-semibold text-ink-soft">
                      Passwort
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Passwort vergessen?
                    </button>
                  </div>
                  <div className="auth-field">
                    <LockKeyhole className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                    <input
                      id="auth-password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Passwort eingeben"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      className="flex p-1 text-ink-muted hover:text-ink-soft"
                    >
                      {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={busy} className="auth-btn-primary">
                  {busy ? (
                    <>
                      <Loader2 className="h-[17px] w-[17px] animate-spin" />
                      Anmeldung läuft …
                    </>
                  ) : (
                    <>
                      <LogIn weight="fill" className="h-[17px] w-[17px]" />
                      Anmelden
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 flex items-start gap-2 border-t border-fill pt-4 text-xs leading-relaxed text-ink-muted">
                <Info className="mt-0.5 h-[15px] w-[15px] shrink-0" />
                <span>
                  Zugänge vergibt die Kommunikationsleitung. Es gibt keinen Self-Service, bei
                  Problemen bitte an die Administration wenden.
                </span>
              </div>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="auth-rise">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-ink-subtle hover:text-brand"
              >
                <ArrowLeft className="h-[15px] w-[15px]" />
                Zurück zur Anmeldung
              </button>

              <span className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-brand-50 text-brand">
                <Key weight="duotone" className="h-6 w-6" />
              </span>
              <h2 className="text-2xl font-bold tracking-tight">Passwort zurücksetzen</h2>
              <p className="mb-6 mt-2 text-sm leading-relaxed text-ink-subtle">
                Gib deine ÖAW-Adresse ein. Die Administration setzt dein Passwort zurück und
                übergibt dir persönlich ein neues Initialpasswort. Einen Self-Service-Reset gibt
                es bewusst nicht.
              </p>

              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label
                    htmlFor="auth-fw-email"
                    className="mb-1.5 block text-xs font-semibold text-ink-soft"
                  >
                    E-Mail-Adresse
                  </label>
                  <div className="auth-field">
                    <Mail className="h-[17px] w-[17px] shrink-0 text-ink-muted" />
                    <input
                      id="auth-fw-email"
                      type="email"
                      autoComplete="email"
                      placeholder="vorname.nachname@oeaw.ac.at"
                      value={fwEmail}
                      onChange={(e) => setFwEmail(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="auth-btn-primary">
                  <Send weight="fill" className="h-4 w-4" />
                  Anfrage per E-Mail senden
                </button>
              </form>
            </div>
          )}

          {mode === 'forgot-sent' && (
            <div className="auth-rise py-2 text-center">
              <span className="auth-pop inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 weight="fill" className="h-9 w-9" />
              </span>
              <h2 className="mt-5 text-[22px] font-bold tracking-tight">Anfrage vorbereitet</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-subtle">
                Dein E-Mail-Programm wurde mit der Anfrage an{' '}
                <span className="font-semibold text-ink">{ADMIN_CONTACT_EMAIL}</span>{' '}
                geöffnet, einfach absenden. Die Kommunikationsleitung meldet sich mit einem neuen
                Initialpasswort.
              </p>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="mt-6 w-full rounded-[11px] border-[1.5px] border-line-strong bg-white px-3 py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-fill"
              >
                Zur Anmeldung
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Linkes Marken-Panel (nur ≥lg): Blau-Verlauf, Ring-Motiv, Claim, Kennzahlen. */
function BrandPanel() {
  return (
    <div className="relative hidden flex-[1.05] flex-col overflow-hidden bg-[linear-gradient(155deg,#0052d6_0%,var(--brand-500)_42%,var(--brand-700)_100%)] p-[52px_56px] text-white lg:flex">
      {/* Dekor: weiche Radial-Flecken + konzentrisches Ring-Motiv */}
      <div
        aria-hidden
        className="absolute -right-[120px] -top-[120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(156,192,255,.32),transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute -bottom-[160px] -left-20 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(0,20,70,.5),transparent_70%)]"
      />
      <div aria-hidden className="absolute right-[70px] top-[60px] h-[150px] w-[150px]">
        <span className="absolute inset-0 rounded-full border-[1.5px] border-white/15" />
        <span className="absolute inset-[26px] rounded-full border-[1.5px] border-white/20" />
        <span className="auth-float absolute inset-[52px] rounded-full bg-[#9cc0ff]/55" />
      </div>

      <div className="relative flex items-center gap-2.5">
        <RadioButton weight="fill" aria-hidden className="h-[26px] w-[26px] text-[#9cc0ff]" />
        <span className="text-[19px] font-semibold tracking-tight">ÖAW Presse</span>
      </div>

      <div className="relative mt-auto">
        <div className="mb-5 font-mono text-xs font-medium uppercase tracking-[.16em] text-[#9cc0ff]">
          Press Relevance Toolkit
        </div>
        <h1 className="max-w-[15ch] text-[40px] font-bold leading-[1.12] tracking-tight">
          Aus Forschung wird Geschichte.
        </h1>
        <p className="mt-5 max-w-[42ch] text-[15.5px] leading-relaxed text-white/80">
          Publikationen bewerten, Veranstaltungen kuratieren, Social-Media-Lagebilder lesen und
          alles im Redaktionsboard zusammenführen.
        </p>
        <div className="mt-8 flex gap-6">
          <BrandStat value="38.900+" label="Publikationen" />
          <div className="w-px bg-white/20" />
          <BrandStat value="8.000+" label="Veranstaltungen" />
          <div className="w-px bg-white/20" />
          <BrandStat value="170+" label="Pressemeldungen" />
        </div>
      </div>

      <div className="relative mt-11 text-xs text-white/50">
        © 2026 Österreichische Akademie der Wissenschaften · Interne Anwendung
      </div>
    </div>
  );
}

function BrandStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-[26px] font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-white/65">{label}</div>
    </div>
  );
}
