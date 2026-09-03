'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { RadioButton, Snowflake } from '@/lib/icons';

/**
 * Dekorations-Layer des Anmelde-Screens, mechanisch aus auth-screen.tsx
 * herausgelöst (Markup/Styles unverändert): Winter-Gag (Frost, Schnee,
 * Zufrieren), Marken-Intro und linkes Marken-Panel. Reine Zierde bzw.
 * eigenständige Anzeige-Bausteine ohne Anteil am Auth-State.
 */

// Dauer des Marken-Intros (BootOverlay). Wird auch in auth-screen.tsx für den
// Phasenwechsel boot→auto/ready verwendet (dort importiert — kein Zirkel).
export const BOOT_MS = 1300;

/** „Auf Eis"-Frost-Overlay über dem Personen-Login. Rein CSS + Inline-SVG-
 *  Rauschen (feTurbulence): Milchglas + kalter Ton, Frost-Korn, Eiskristall-
 *  Kriechen aus den Ecken, Frost-Rand, wandernder Glanz-Sweep und funkelnde
 *  Kristalle. `pointer-events-none` → das Formular darunter bleibt bedienbar.
 *  Web-Recherche 2026-07-07: feTurbulence-Rauschen + backdrop-filter ist der
 *  Standard für Frost/Milchglas ohne externe Library. */
const FROST_NOISE =
  "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27140%27%20height=%27140%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%270.85%27%20numOctaves=%272%27%20stitchTiles=%27stitch%27/%3E%3CfeColorMatrix%20type=%27saturate%27%20values=%270%27/%3E%3C/filter%3E%3Crect%20width=%27100%25%27%20height=%27100%25%27%20filter=%27url(%23n)%27/%3E%3C/svg%3E";

// Dichter Canvas-Schneefall (tsParticles), lazy + ssr:false — nicht im
// kritischen Login-Pfad. Der CSS-Frost bleibt Basis/Fallback, falls das
// Skript (noch) nicht geladen ist.
const SnowParticles = dynamic(() => import('./snow-particles'), { ssr: false });
export const BoardBlizzard = dynamic(
  () => import('./snow-particles').then((m) => m.BoardBlizzard),
  { ssr: false },
);

// Fallschnee-Kristalle (deterministisch für SSR — kein Math.random). Spalte,
// Größe, Falldauer, Startverzögerung, horizontaler Drift, Glyph.
const SNOW: Array<{ l: string; s: number; d: number; dl: number; dr: number; g: string }> = [
  { l: '5%', s: 11, d: 7.5, dl: 0, dr: 16, g: '❄' },
  { l: '12%', s: 6, d: 10, dl: 1.3, dr: -10, g: '❅' },
  { l: '19%', s: 9, d: 8.5, dl: 3.1, dr: 8, g: '❄' },
  { l: '27%', s: 5, d: 11, dl: 0.6, dr: -14, g: '·' },
  { l: '34%', s: 13, d: 6.8, dl: 2.4, dr: 20, g: '❆' },
  { l: '42%', s: 7, d: 9.5, dl: 4.2, dr: -6, g: '❄' },
  { l: '50%', s: 8, d: 8, dl: 1.1, dr: 12, g: '❅' },
  { l: '58%', s: 5, d: 10.5, dl: 3.6, dr: -16, g: '✦' },
  { l: '65%', s: 12, d: 7, dl: 0.3, dr: 10, g: '❆' },
  { l: '72%', s: 6, d: 9, dl: 2.9, dr: -12, g: '❄' },
  { l: '79%', s: 9, d: 8.8, dl: 4.8, dr: 6, g: '❅' },
  { l: '86%', s: 7, d: 10, dl: 1.7, dr: -8, g: '·' },
  { l: '92%', s: 11, d: 7.3, dl: 3.3, dr: 18, g: '❄' },
  { l: '9%', s: 5, d: 11.5, dl: 5.4, dr: -18, g: '✦' },
  { l: '47%', s: 6, d: 9.2, dl: 6, dr: -10, g: '❄' },
  { l: '76%', s: 5, d: 10.8, dl: 5.1, dr: 14, g: '❅' },
];

export function FrostOverlay() {
  return (
    <div
      aria-hidden
      className="frost-freeze pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]"
    >
      {/* Milchglas + kalter Blau-Weiß-Ton */}
      <div
        className="absolute inset-0 backdrop-blur-[2.5px]"
        style={{
          background:
            'linear-gradient(135deg,rgba(214,231,255,.62),rgba(255,255,255,.34) 45%,rgba(186,214,255,.6))',
        }}
      />
      {/* Frost-Korn (SVG-Rauschen), kräftiger */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{ backgroundImage: `url("${FROST_NOISE}")`, backgroundSize: '140px 140px', opacity: 0.4 }}
      />
      {/* Eiskristall-Kriechen aus den Ecken + oben/unten, dichter */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(150px 110px at 0% 0%,rgba(255,255,255,.98),transparent 66%),radial-gradient(150px 110px at 100% 0%,rgba(255,255,255,.88),transparent 66%),radial-gradient(170px 140px at 100% 100%,rgba(213,231,255,.85),transparent 68%),radial-gradient(170px 140px at 0% 100%,rgba(213,231,255,.8),transparent 68%),radial-gradient(220px 60px at 50% 0%,rgba(255,255,255,.55),transparent 70%)',
        }}
      />
      {/* Eiszapfen am oberen Rand */}
      <div className="absolute inset-x-0 top-0 h-5">
        {[
          { l: '10%', w: 5, h: 14 },
          { l: '24%', w: 7, h: 20 },
          { l: '38%', w: 4, h: 11 },
          { l: '52%', w: 6, h: 17 },
          { l: '66%', w: 5, h: 22 },
          { l: '80%', w: 7, h: 13 },
          { l: '90%', w: 4, h: 16 },
        ].map((ic, i) => (
          <span
            key={i}
            className="absolute top-0"
            style={{
              left: ic.l,
              width: ic.w,
              height: ic.h,
              background: 'linear-gradient(to bottom,rgba(255,255,255,.95),rgba(200,224,255,.25))',
              clipPath: 'polygon(0 0,100% 0,50% 100%)',
            }}
          />
        ))}
      </div>
      {/* Frost-Rand mit pulsierendem Kälte-Glow */}
      <div
        className="ice-glow absolute inset-0 rounded-[14px]"
        style={{ boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.8),inset 0 0 32px rgba(186,214,255,.85)' }}
      />
      {/* Doppelter Glanz-Sweep */}
      <div
        className="frost-shimmer absolute inset-y-0 left-0 w-2/5"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent)' }}
      />
      {/* Dichter Canvas-Schneefall (tsParticles) über dem Frost */}
      <SnowParticles />
      {/* Große CSS-Vordergrund-Flocken (Tiefe zusätzlich zum Canvas) */}
      {SNOW.map((f, i) => (
        <span
          key={i}
          className="snowflake absolute top-0 text-white"
          style={
            {
              left: f.l,
              fontSize: f.s * 1.6,
              lineHeight: 1,
              animationDelay: `${f.dl}s`,
              '--sdur': `${f.d}s`,
              '--drift': `${f.dr}px`,
            } as React.CSSProperties
          }
        >
          {f.g}
        </span>
      ))}
      {/* Stationär funkelnde Kristalle (größer, User-Wunsch) */}
      <span className="ice-sparkle absolute text-white" style={{ top: '17%', left: '21%', fontSize: 22 }}>❄</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '58%', left: '8%', fontSize: 15, animationDelay: '.7s' }}>✦</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '33%', right: '12%', fontSize: 19, animationDelay: '1.4s' }}>❄</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '77%', right: '18%', fontSize: 23, animationDelay: '.4s' }}>❆</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '47%', left: '55%', fontSize: 13, animationDelay: '2s' }}>✦</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '23%', left: '67%', fontSize: 17, animationDelay: '1.1s' }}>❄</span>
      <span className="ice-sparkle absolute text-white" style={{ top: '67%', left: '39%', fontSize: 15, animationDelay: '2.6s' }}>✦</span>
    </div>
  );
}

/** Verschneite rechte Ecke des „Willkommen zurück"-Screens (variant="login"),
 *  den man beim Klick auf das eisige Board bekommt: dichter Schneefall
 *  (tsParticles) + Frost-Wehe + Eiszapfen + geballte Kristalle. Nur Zierde,
 *  pointer-events-none. */
export function WinterCorner() {
  return (
    <div aria-hidden className="pointer-events-none absolute right-0 top-0 z-20 h-80 w-80 overflow-hidden">
      {/* Fallender Schnee kommt vom BoardBlizzard; hier nur statischer Frost. */}
      {/* Frost-Schnee-Wehe: dicht in der Ecke, nach innen ausblendend */}
      <div
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full"
        style={{
          background:
            'radial-gradient(circle,rgba(255,255,255,.95),rgba(214,231,255,.7) 40%,rgba(214,231,255,.15) 66%,transparent 74%)',
        }}
      />
      {/* Eiszapfen an der Oberkante (rechte Hälfte) */}
      <div className="absolute right-0 top-0 flex w-3/4 justify-end gap-1.5 pr-1">
        {[16, 24, 12, 28, 18, 22, 14, 20].map((h, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: h,
              background: 'linear-gradient(to bottom,rgba(255,255,255,.95),rgba(190,214,255,.25))',
              clipPath: 'polygon(0 0,100% 0,50% 100%)',
            }}
          />
        ))}
      </div>
      {/* geballte, funkelnde Kristalle in der Ecke */}
      <span className="ice-sparkle absolute text-white drop-shadow" style={{ top: '9%', right: '10%', fontSize: 24 }}>❄</span>
      <span className="ice-sparkle absolute text-white drop-shadow" style={{ top: '24%', right: '26%', fontSize: 16, animationDelay: '.7s' }}>❆</span>
      <span className="ice-sparkle absolute text-white drop-shadow" style={{ top: '15%', right: '42%', fontSize: 13, animationDelay: '1.5s' }}>✦</span>
      <span className="ice-sparkle absolute text-white drop-shadow" style={{ top: '38%', right: '14%', fontSize: 18, animationDelay: '.3s' }}>❄</span>
      <span className="ice-sparkle absolute text-white drop-shadow" style={{ top: '30%', right: '50%', fontSize: 11, animationDelay: '2.1s' }}>✦</span>
    </div>
  );
}

/** „Zufrier"-Rauswurf: die Seite friert per clip-path-Kreis aus der oberen
 *  rechten (verschneiten) Ecke zu — Whiteout + kurze Botschaft, dann Redirect.
 *  Web-Recherche 2026-07-07: clip-path-Wipe ist der saubere Weg für so eine
 *  Freeze-Over-Transition (Transition.css & Co.). */
export function FreezeOverEject() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden" aria-hidden>
      <div
        className="freeze-over absolute inset-0"
        style={{ background: 'radial-gradient(circle at 100% 0%,#ffffff,#eaf3ff 55%,#dbe7ff)' }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `url("${FROST_NOISE}")`, backgroundSize: '160px 160px', opacity: 0.22, mixBlendMode: 'multiply' }}
        />
      </div>
      <div className="freeze-msg relative z-10 flex flex-col items-center gap-2 text-center">
        <Snowflake weight="fill" className="h-14 w-14 text-brand-500" />
        <p className="text-xl font-bold tracking-tight text-brand-700">Das Board liegt noch auf Eis.</p>
        <p className="text-sm text-brand-500/80">Wird gleich zurückgebracht …</p>
      </div>
    </div>
  );
}

/** Kurzes Marken-Intro beim Laden („immer kurz geladen", User-Wunsch): blaues
 *  Vollbild mit pulsierendem Ring-Motiv, Logo und Fortschrittsbalken. Wird nach
 *  BOOT_MS ausgehängt; die dahinterliegende Seite ist dann bereits aufgebaut
 *  (auth-rise), sodass das Overlay in die fertige Seite übergeht. */
export function BootOverlay() {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-[linear-gradient(155deg,#0052d6_0%,var(--brand-500)_42%,var(--brand-700)_100%)] text-white"
      style={{ animation: `auth-boot ${BOOT_MS}ms ease both` }}
      aria-hidden
    >
      <div className="relative h-[120px] w-[120px]">
        <span className="absolute inset-0 rounded-full border-[1.5px] border-white/15" />
        <span className="auth-boot-ring absolute inset-0 rounded-full border-[1.5px] border-white/35" />
        <span
          className="auth-boot-ring absolute inset-0 rounded-full border-[1.5px] border-white/25"
          style={{ animationDelay: '.35s' }}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <RadioButton weight="fill" className="h-12 w-12 text-[#9cc0ff]" />
        </span>
      </div>
      <span className="text-[19px] font-semibold tracking-tight">ÖAW Presse</span>
      <div className="h-[3px] w-40 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-[#9cc0ff]"
          style={{ animation: `auth-progress ${BOOT_MS}ms cubic-bezier(.3,.7,.3,1) both` }}
        />
      </div>
    </div>
  );
}

/** Dezentes Ambient-Fade der neuesten hoch bewerteten Titel im Freiraum des
 *  Brandpanels: crossfadet alle ~5 s zum nächsten Titel (Opacity-Transition).
 *  Nur Titel (kein Score) — pre-Gate. */
/** Ambient-Haiku im blauen Freiraum: ein Haiku taucht weich aus dem Hintergrund
 *  auf, hält kurz, faedet wieder aus, dann das nächste. Ohne Überschrift — eine
 *  poetische Erscheinung, kein Kachel-Element. `key={i}` startet die Breath-
 *  Animation bei jedem Wechsel neu; das Intervall ist auf ihre Dauer getaktet. */
function HaikuRotator({ haikus }: { haikus: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (haikus.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % haikus.length), 10000);
    return () => clearInterval(t);
  }, [haikus.length]);

  const lines = (haikus[i] ?? '').split('/').map((l) => l.trim()).filter(Boolean);
  return (
    <p
      key={i}
      aria-hidden
      className="text-[22px] font-light italic leading-[1.6] tracking-tight text-white"
    >
      {lines.map((line, li) => (
        <span
          key={li}
          className="block whitespace-nowrap"
          style={{ animation: 'auth-haiku-line 8s ease-in-out both', animationDelay: `${li * 0.7}s` }}
        >
          {line}
        </span>
      ))}
    </p>
  );
}

/** Linkes Marken-Panel (nur ≥lg): Blau-Verlauf, Ring-Motiv, Claim, Kennzahlen. */
export function BrandPanel() {
  // Kennzahlen live (gate-öffentlicher, gecachter Endpoint); Ellipsen-Platzhalter
  // bis geladen. Sichtbar erst nach dem Boot-Overlay, das den kurzen Ladeblick
  // ohnehin verdeckt. Kein Fallback-Hardcoding (das wäre die alte Falschzahl).
  const [stats, setStats] = useState<{
    scoredPublications: number;
    upcomingEvents: number;
    pressReleasesWithDoi: number;
    hotHaikus?: string[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/stats/landing')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setStats(d);
      })
      .catch(() => {
        /* Kennzahlen sind Zierde — bei Fehler bleibt der Platzhalter. */
      });
    return () => {
      alive = false;
    };
  }, []);
  // Tausender mit Punkt, deterministisch: toLocaleString('de-AT') liefert im
  // Browser ein Schmalspatium (U+202F) statt des Punkts („8 010"). Eigene
  // Gruppierung vermeidet die ICU-Abhängigkeit.
  const fmt = (n: number | undefined) =>
    n == null ? '…' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return (
    <div className="relative z-10 hidden flex-[1.05] flex-col overflow-hidden bg-[linear-gradient(155deg,#0052d6_0%,var(--brand-500)_42%,var(--brand-700)_100%)] p-[52px_56px] text-white lg:flex">
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

      {/* „Neu im Programm"-Haiku: poetische Erscheinung im blauen Freiraum —
          taucht sanft aus dem Hintergrund auf und faedet wieder aus. Ohne
          Überschrift, nur das Haiku (gate-öffentlich, kein Score/Titel-Leak). */}
      {stats?.hotHaikus && stats.hotHaikus.length > 0 && (
        // Rechts oben unter dem Ring-Motiv im blauen Freiraum, rechtsbündig.
        // Freistehend + absolut → bei zu kleinem Panel überlappt es den Claim-
        // Block, daher NUR bei genug Breite UND Höhe zeigen (sonst weg), damit
        // „Aus Forschung wird Geschichte"/„Press Relevance Toolkit" frei bleibt.
        <div className="pointer-events-none absolute right-[70px] top-[248px] z-[5] hidden text-right xl:[@media(min-height:800px)]:block">
          <HaikuRotator haikus={stats.hotHaikus} />
        </div>
      )}


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
          <BrandStat value={fmt(stats?.scoredPublications)} label="Bewertete Publikationen" />
          <div className="w-px bg-white/20" />
          <BrandStat value={fmt(stats?.upcomingEvents)} label="Anstehende Veranstaltungen" />
          <div className="w-px bg-white/20" />
          <BrandStat value={fmt(stats?.pressReleasesWithDoi)} label="Pressemeldungen mit DOI" />
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
