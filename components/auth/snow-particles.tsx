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
    opacity: { value: { min: 0.25, max: 0.95 } },
    // Tiefe: kleine ferne bis große nahe Flocken (größer, User-Wunsch).
    size: { value: { min: 2, max: 8.5 } },
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
