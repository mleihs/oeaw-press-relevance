'use client';

import Particles, { ParticlesProvider } from '@tsparticles/react';
import type { Engine, ISourceOptions } from '@tsparticles/engine';
import { loadSnowPreset } from '@tsparticles/preset-snow';

// Engine-Registrierung: Snow-Preset laden (tsParticles v4: über den Provider).
async function initSnowEngine(engine: Engine): Promise<void> {
  await loadSnowPreset(engine);
}

// Dichter, tiefengestaffelter Schneefall. Preset „snow" (Fall nach unten +
// Wind) mit aufgedrehten Werten für maximum drama.
const SNOW_OPTIONS: ISourceOptions = {
  preset: 'snow',
  fullScreen: { enable: false },
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  detectRetina: true,
  particles: {
    number: { value: 130, density: { enable: true } },
    color: { value: '#ffffff' },
    // „Schmelzen" auf dem Weg (User-Wunsch): über die Lebenszeit verblassen…
    opacity: {
      value: { min: 0, max: 0.95 },
      animation: { enable: true, speed: 0.4, startValue: 'max', destroy: 'min', sync: false },
    },
    // …und schrumpfen. Tiefe: kleine ferne bis große nahe Flocken.
    size: {
      value: { min: 0.5, max: 8.5 },
      animation: { enable: true, speed: 1.8, startValue: 'max', destroy: 'none', sync: false },
    },
    move: { speed: { min: 1, max: 3.4 }, straight: false },
    // Seitliches Treiben für lebendigen Fall.
    wobble: { enable: true, distance: 14, speed: { min: -8, max: 8 } },
    zIndex: { value: { min: 0, max: 50 } },
  },
};

/**
 * Dichter Canvas-Schneefall über dem „auf Eis" liegenden Personen-Login
 * (maximum drama, User-Wunsch). Bewusst eigene Datei + per next/dynamic
 * ssr:false lazy geladen: tsParticles gehört nicht in den kritischen Login-
 * Pfad und nicht ins SSR. Der Canvas füllt die FrostOverlay (absolute
 * inset-0); pointer-events bleiben aus.
 */
export default function SnowParticles() {
  return (
    <ParticlesProvider init={initSnowEngine}>
      <Particles
        id="frost-snow"
        className="pointer-events-none absolute inset-0"
        options={SNOW_OPTIONS}
      />
    </ParticlesProvider>
  );
}

// „Board auf Eis"-Blizzard fürs „Willkommen zurück" (via Board-Klick). Eine
// dichte Canvas ÜBER allem, damit der Schnee das Login-Panel umspielt/überzieht.
// Lehren aus der Iteration 2026-07-07:
//  - density AUS (sonst skaliert tsParticles die Menge nach Fläche runter),
//  - STEADY Opazität/Größe (der Schmelz-Fade dünnte den Blizzard sichtbar aus),
//  - Partikel-shadow (blauer Glow), damit weiße Flocken auch auf dem HELLEN
//    Login-Panel Kontrast haben (weiß-auf-hell war fast unsichtbar),
//  - Tiefe über Größen-Streuung + zIndex statt zweiter Ebene (die zweite
//    Particles-Instanz unter einem Provider lief unzuverlässig).
const BLIZZARD: ISourceOptions = {
  preset: 'snow',
  fullScreen: { enable: false },
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  detectRetina: true,
  particles: {
    number: { value: 420, density: { enable: false } },
    color: { value: '#ffffff' },
    shadow: { enable: true, color: '#5b8bff', blur: 6 },
    opacity: { value: { min: 0.45, max: 0.95 } },
    size: { value: { min: 1, max: 15 } },
    move: { speed: { min: 2, max: 6.5 }, straight: false, drift: { min: -2, max: 2 } },
    wobble: { enable: true, distance: 28, speed: { min: -14, max: 14 } },
    // Tiefe: weiter „hintere" Flocken kleiner/langsamer via zIndex-Rate.
    zIndex: { value: { min: 0, max: 70 }, opacityRate: 0.2, sizeRate: 1.1 },
  },
};

export function BoardBlizzard() {
  return (
    <ParticlesProvider init={initSnowEngine}>
      {/* Über den Panels (z-35 < FreezeOverEject z-70), pointer-events aus. */}
      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 35 }}>
        <Particles id="board-blizzard" className="absolute inset-0" options={BLIZZARD} />
      </div>
    </ParticlesProvider>
  );
}
