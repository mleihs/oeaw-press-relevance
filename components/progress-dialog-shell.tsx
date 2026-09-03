'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { StatusBanner } from '@/components/status-banner';
import { useIsMobile } from '@/lib/client/hooks/use-is-mobile';
import { cn } from '@/lib/shared/utils';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Play,
  X,
  type LucideIcon,
} from '@/lib/icons';

// Gemeinsame Shell der beiden SSE-Fortschritts-Dialoge — ScoringModal
// (components/scoring-modal.tsx) und Social-RefreshButton
// (app/social/_components/refresh-button.tsx) sind bewusste Zwillinge „aus
// einem Guss": getinteter Kopf mit Brand-Icon, Modell-Picker + Checkbox im
// Idle, animierter 3-Phasen-Stepper aus den SSE-Frames, Live-Metrik-Karten,
// Desktop-Dialog / Mobile-Drawer. Hier lebt die geteilte Optik/Struktur;
// Domänen-Copy, Endpunkte und Frame-Interpretation bleiben in den Aufrufern.

export const PROGRESS_EASE = [0.22, 1, 0.36, 1] as const;

export type ProgressPhase = 'idle' | 'running' | 'done' | 'skipped' | 'error';

export interface ProgressStepDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Sekunden-Timer eines Laufs: startet bei 0, sobald `running` true wird,
 *  tickt alle 250 ms und friert beim Verlassen von `running` ein (für die
 *  „Fertig · Xs"-Zeile). */
export function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}

/** Responsive Hülle: Desktop = zentrierter Dialog, Mobile = Bottom-Drawer;
 *  beide mit dem getinteten Kopf (Brand-Icon-Quadrat, Titel + Beschreibung, X).
 *  `TitleSlot` liefert das jeweils a11y-korrekte Title-Primitive (Radix Dialog
 *  bzw. vaul). */
export function ProgressDialogShell({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  const header = (TitleSlot: TitleSlotComponent, className?: string) => (
    <div
      className={cn(
        'flex items-start gap-3 border-b border-line/70 bg-gradient-to-br from-brand-50 to-surface-muted px-5 py-4 dark:from-brand-500/10 dark:to-transparent',
        className,
      )}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-500 text-white shadow-[0_4px_12px_rgba(0,71,187,.32)]"
        aria-hidden
      >
        <Icon className="h-5 w-5" weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <TitleSlot className="text-base font-bold tracking-[-0.01em]">{title}</TitleSlot>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface/70 text-ink-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent grabber={false} className="max-h-[92%]">
        <div className="overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]">
          {header(DrawerTitle, 'rounded-t-[22px]')}
          <div className="px-4 pt-4">{children}</div>
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]" showCloseButton={false}>
        {header(DialogTitle)}
        <div className="px-5 pb-5 pt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

type TitleSlotComponent = React.ComponentType<{
  className?: string;
  children?: React.ReactNode;
}>;

/** Phasen-Übergang des Dialog-Innenlebens (Idle ↔ Lauf ↔ Ergebnis):
 *  AnimatePresence-Fade mit leichtem Y-Versatz, reduced-motion-gated.
 *  `stageKey` wechselt pro sichtbarer Stufe (z.B. `active ? 'active' : phase`). */
export function PhaseTransition({
  stageKey,
  children,
}: {
  stageKey: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stageKey}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: PROGRESS_EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Custom-Checkbox des Idle-Screens (Force/Throttle-Schalter). */
export function ForceCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-strong">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          checked ? 'border-brand-500 bg-brand-500' : 'border-line-strong bg-surface',
        )}
        aria-hidden
      >
        <Check className={cn('h-3 w-3 text-white', checked ? 'opacity-100' : 'opacity-0')} weight="bold" />
      </span>
      {children}
    </label>
  );
}

/** Primärer Start-Knopf des Idle-Screens (Play-Icon, Tap-Squeeze). */
export function StartRunButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div whileTap={reduce ? undefined : { scale: 0.985 }}>
      <Button
        onClick={onClick}
        className="w-full gap-2 rounded-[11px] py-5 text-sm font-semibold shadow-[0_6px_16px_rgba(0,71,187,.28)]"
      >
        <Play className="h-4 w-4" weight="fill" /> {children}
      </Button>
    </motion.div>
  );
}

/** 3-Phasen-Stepper (Kreise + füllende Verbindungslinien). `current` ist der
 *  Key des aktiven Schritts (null = noch keiner), `done` schaltet alle
 *  Schritte und Linien auf fertig. */
export function PhaseStepper({
  steps,
  current,
  done,
}: {
  steps: ProgressStepDef[];
  current: string | null;
  done: boolean;
}) {
  const reduce = useReducedMotion();
  const curIdx = current ? steps.findIndex((s) => s.key === current) : -1;
  const stepState = (i: number): 'done' | 'active' | 'pending' =>
    done ? 'done' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const st = stepState(i);
        const Icon = s.icon;
        return (
          <li key={s.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-16 flex-col items-center gap-1.5 text-center">
              <motion.div
                animate={reduce ? undefined : { scale: st === 'active' ? 1.08 : 1 }}
                transition={{
                  duration: 0.3,
                  repeat: st === 'active' ? Infinity : 0,
                  repeatType: 'reverse',
                }}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  st === 'done' && 'border-brand bg-brand text-white',
                  st === 'active' && 'border-brand bg-surface text-brand',
                  st === 'pending' && 'border-line text-ink-soft/60',
                )}
              >
                {st === 'done' ? (
                  <Check className="h-4 w-4" weight="bold" />
                ) : st === 'active' ? (
                  <Loader2 className="h-4 w-4 animate-spin" weight="bold" />
                ) : (
                  <Icon className="h-4 w-4" weight="bold" />
                )}
              </motion.div>
              <span
                className={cn(
                  'text-2xs leading-tight',
                  st === 'pending' ? 'text-ink-soft' : 'font-medium text-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mt-[19px] h-0.5 flex-1 overflow-hidden rounded bg-fill">
                <div
                  className={cn(
                    'h-full rounded bg-brand transition-all duration-500',
                    i < curIdx || done ? 'w-full' : 'w-0',
                  )}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Gradient-Fortschrittsbalken mit Mono-Zeile darunter. `label` ist die linke
 *  Zählzeile („X / Y bewertet"); optionale `children` (z.B. der aktuell
 *  bearbeitete Titel) hängen unter dem Balkenblock. */
export function RunProgressBar({
  pct,
  done,
  label,
  children,
}: {
  pct: number;
  done: boolean;
  label: React.ReactNode;
  children?: React.ReactNode;
}) {
  const shown = done ? 100 : pct;
  return (
    <div className="space-y-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-fill">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-[width] duration-300"
          style={{ width: `${shown}%` }}
          role="progressbar"
          aria-valuenow={shown}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex justify-between font-mono text-2xs text-ink-subtle">
        <span>{label}</span>
        <span>{shown}%</span>
      </div>
      {children}
    </div>
  );
}

/** Raster der Live-Metrik-Karten (Mock: 3 Karten). */
export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 text-center">{children}</div>;
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-line/70 bg-surface-muted px-2 py-2">
      <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-2xs text-ink-soft">{label}</div>
    </div>
  );
}

/** Mono-Statuszeile „Läuft/Fertig · Xs · N Tokens". */
export function ElapsedLine({
  done,
  elapsed,
  tokens,
}: {
  done: boolean;
  elapsed: number;
  tokens: number;
}) {
  return (
    <p className="text-center font-mono text-2xs text-ink-soft">
      {done ? 'Fertig' : 'Läuft'} · {elapsed}s
      {tokens > 0 && ` · ${tokens.toLocaleString('de-AT')} Tokens`}
    </p>
  );
}

/** Nicht-fatale Fehler während des Laufs (SSE-`error`-Frames ohne `fatal`). */
export function RunWarning({ children }: { children: React.ReactNode }) {
  return (
    <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}>
      {children}
    </StatusBanner>
  );
}

/** Spinner-Zeile am Fuß des laufenden Dialogs. */
export function RunningHint() {
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft">
      <Loader2 className="h-4 w-4 animate-spin" weight="bold" /> Läuft …
    </div>
  );
}

/** Erfolgs-Abschluss: grüne Ergebnis-Karte (Copy via `children`) + Schließen. */
export function DoneSection({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: PROGRESS_EASE }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2.5 rounded-[11px] border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0" weight="fill" />
        {children}
      </div>
      <Button variant="outline" onClick={onClose} className="w-full rounded-[11px]">
        Schließen
      </Button>
    </motion.div>
  );
}

/** Übersprungen-Abschluss: neutrales Banner + domänenspezifische Aktion
 *  (Schließen bzw. „Trotzdem aktualisieren"). */
export function SkippedSection({
  msg,
  children,
}: {
  msg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <StatusBanner variant="neutral" className="px-3 py-3 text-sm">
        {msg}
      </StatusBanner>
      {children}
    </div>
  );
}

/** Fataler Abschluss: Fehler-Banner + Schließen. */
export function ErrorSection({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <StatusBanner
        variant="error"
        icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
        className="space-y-1 px-3 py-3 text-sm"
      >
        <p className="font-medium">Fehler</p>
        <p>{msg}</p>
      </StatusBanner>
      <Button variant="outline" onClick={onClose} className="w-full rounded-[11px]">
        Schließen
      </Button>
    </div>
  );
}
