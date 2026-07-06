'use client';

import type { BoardMember, CardDetail } from '@/lib/shared/board';
import { displayNameOf } from '../_lib/people';
import { BoardAvatar } from './board-avatar';
import { Timer } from '@/lib/icons';

/** Abschluss-Celebration fürs Karten-Modal (Design Board-Celebration §1a):
 *  Konfetti-Bursts (canvas-confetti, global über dem Dialog), federndes
 *  Häkchen-Badge mit Schockwellen-Ringen, grüner Kopf + Mitwirkenden-Banner.
 *  Motion ist reduced-motion-gated: canvas-confetti über
 *  disableForReducedMotion, Badge/Banner über den globalen CSS-Reset
 *  (globals.css) plus Skip in fireCelebrationConfetti/CardModal. */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Konfetti-Choreografie aus dem Design: Hauptburst am Badge, Sternenring,
 *  seitliche Kanonen einen Beat später, weicher Schluss-Pop. Origin = Mitte
 *  des Modal-Contents (el), damit es unabhängig von Viewport-Größe passt. */
export async function fireCelebrationConfetti(el: HTMLElement | null): Promise<void> {
  if (prefersReducedMotion()) return;
  const confetti = (await import('canvas-confetti')).default;
  let x = 0.5;
  let y = 0.4;
  if (el) {
    const r = el.getBoundingClientRect();
    x = (r.left + r.width / 2) / window.innerWidth;
    y = (r.top + r.height * 0.4) / window.innerHeight;
  }
  const origin = { x, y };
  const colors = ['#0047bb', '#2f6bff', '#6ea8ff', '#10b981', '#34d399', '#f59e0b', '#ffffff'];
  const base = { disableForReducedMotion: true, zIndex: 9999 };
  confetti({ ...base, particleCount: 110, spread: 100, startVelocity: 46, decay: 0.9, scalar: 1.05, ticks: 260, origin, colors });
  confetti({
    ...base,
    particleCount: 32,
    spread: 360,
    startVelocity: 26,
    decay: 0.92,
    scalar: 1.35,
    ticks: 220,
    shapes: ['star'],
    origin,
    colors: ['#f59e0b', '#fcd34d', '#ffffff', '#34d399'],
  });
  const yy = Math.min(0.95, y + 0.2);
  setTimeout(() => {
    confetti({ ...base, particleCount: 60, angle: 60, spread: 72, startVelocity: 54, origin: { x: Math.max(0, x - 0.3), y: yy }, colors });
    confetti({ ...base, particleCount: 60, angle: 120, spread: 72, startVelocity: 54, origin: { x: Math.min(1, x + 0.3), y: yy }, colors });
  }, 160);
  setTimeout(() => {
    confetti({ ...base, particleCount: 45, spread: 130, startVelocity: 32, scalar: 0.9, ticks: 170, origin, colors });
  }, 340);
}

/** Badge-Overlay: Glow-Blitz, zwei versetzte Schockwellen-Ringe, federndes
 *  grünes Badge mit gezeichnetem Häkchen. Liegt absolut über dem Modal-Body. */
export function CelebrationOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="relative h-24 w-24">
        <span className="absolute inset-0 animate-[bc-glow_.9s_ease-out_forwards] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.55),rgba(16,185,129,0)_68%)]" />
        <span className="absolute inset-0 animate-[bc-ring_1s_cubic-bezier(.2,.6,.3,1)_forwards] rounded-full border-[3px] border-emerald-500/65" />
        <span className="absolute inset-0 animate-[bc-ring_1s_cubic-bezier(.2,.6,.3,1)_.18s_forwards] rounded-full border-[3px] border-[#6ea8ff]/60 opacity-0" />
        <div className="absolute inset-1.5 flex animate-[bc-badge_.55s_cubic-bezier(.2,.8,.3,1)_forwards] items-center justify-center rounded-full bg-[linear-gradient(150deg,#34d399,#059669)] shadow-[0_12px_30px_rgba(16,185,129,.5)]">
          <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden>
            <path
              d="M13 25 L21 33 L35 15"
              fill="none"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: 42, strokeDashoffset: 42, animation: 'bc-draw .38s ease .2s forwards' }}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** „Benötigte Zeit" menschenlesbar: Tage · Stunden, Stunden · Minuten oder
 *  Minuten — grob wie MeisterTask („3 Tage · 4 Std."). */
export function formatNeededTime(createdAt: string, completedAt: string): string {
  const ms = Math.max(0, new Date(completedAt).getTime() - new Date(createdAt).getTime());
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} ${d === 1 ? 'Tag' : 'Tage'} · ${h % 24} Std.`;
  if (h > 0) return `${h} Std. · ${min % 60} Min.`;
  return `${Math.max(1, min)} Min.`;
}

/** Mitwirkende einer Karte: alle Personen, die sichtbar beigetragen haben
 *  (Erstellung, Zuständigkeit, abgehakte Punkte, Kommentare, Aktivität),
 *  dedupliziert in stabiler Reihenfolge des ersten Auftretens. */
export function contributorsOf(card: CardDetail, byId: Map<string, BoardMember>): BoardMember[] {
  const ids: (string | null)[] = [
    card.created_by,
    card.assignee_id,
    ...card.items.map((i) => i.done_by),
    ...card.comments.map((c) => c.author_id),
    ...card.activity.map((a) => a.actor_id),
  ];
  const seen = new Set<string>();
  const out: BoardMember[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const m = byId.get(id);
    if (m) out.push(m);
  }
  return out;
}

/** Grünes Banner unterm Abgeschlossen-Kopf: Benötigte Zeit + Mitwirkende mit
 *  überlappenden Avataren (max 4, Rest als +N). */
export function CompletionBanner({
  card,
  byId,
}: {
  card: CardDetail;
  byId: Map<string, BoardMember>;
}) {
  if (!card.completed_at) return null;
  const contributors = contributorsOf(card, byId);
  const shown = contributors.slice(0, 4);
  const extra = contributors.length - shown.length;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#d5f0e0] bg-[linear-gradient(90deg,#f0fdf4,#ecfdf5)] dark:border-emerald-950 dark:bg-[linear-gradient(90deg,#0f2a20,#0d241d)] px-4 py-3 [animation:bc-banner_.45s_ease_both] md:px-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Timer weight="bold" className="h-[17px] w-[17px]" />
        </span>
        <div>
          <div className="font-mono text-2xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
            Benötigte Zeit
          </div>
          <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
            {formatNeededTime(card.created_at, card.completed_at)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-mono text-2xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
            Mitwirkende
          </div>
          <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
            {contributors.length === 1
              ? '1 Person trug bei'
              : `${contributors.length} Personen trugen bei`}
          </div>
        </div>
        <div className="flex items-center pl-1">
          {shown.map((m, i) => (
            <span
              key={m.id}
              title={displayNameOf(m)}
              className="relative flex rounded-full shadow-sm"
              style={{ marginLeft: i ? -11 : 0, zIndex: 20 - i }}
            >
              <BoardAvatar
                member={m}
                size={30}
                className="border-2 border-[#f0fdf4] dark:border-[#0f2a20]"
              />
            </span>
          ))}
          {extra > 0 && (
            <span
              className="relative z-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[#f0fdf4] bg-emerald-200 text-2xs font-bold text-emerald-800 dark:border-[#0f2a20] dark:bg-emerald-900 dark:text-emerald-200 shadow-sm"
              style={{ marginLeft: -11 }}
            >
              +{extra}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
