'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/shared/utils';
import { useIsMac } from '@/lib/client/commands/platform';
import type { Binding } from '@/lib/client/commands/keybindings';
import { NAV_SPECS, ACTION_SPECS } from '@/lib/client/commands/registry';

/** Keycap labels for a binding, platform-correct (⌘ on macOS, Strg else). */
function bindingKeys(binding: Binding, mac: boolean): string[] {
  if (binding.kind === 'chord') return [mac ? '⌘' : 'Strg', binding.key.toUpperCase()];
  if (binding.kind === 'single') return [binding.key];
  return [binding.lead.toUpperCase(), 'dann', binding.key.toUpperCase()];
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function Row({
  label,
  binding,
  mac,
}: {
  label: string;
  binding: Binding;
  mac: boolean;
}) {
  const parts = bindingKeys(binding, mac);
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {parts.map((p, i) =>
          p === 'dann' ? (
            <span key={i} className="px-0.5 text-[11px] text-muted-foreground/70">
              dann
            </span>
          ) : (
            <Kbd key={i}>{p}</Kbd>
          ),
        )}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

/** Narrows specs to those that actually carry a binding (no `as` cast). */
function hasBinding<T extends { binding?: Binding }>(
  spec: T,
): spec is T & { binding: Binding } {
  return spec.binding !== undefined;
}

/**
 * The cheat-sheet is rendered entirely from the same registry the palette and
 * the keybinding matcher consume, so it can never advertise a shortcut that
 * is not actually wired (single source of truth).
 */
export function CommandCheatsheet({
  open,
  onOpenChange,
  shortcutsEnabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shortcutsEnabled: boolean;
}) {
  const mac = useIsMac();
  const navWithKeys = NAV_SPECS.filter(hasBinding);
  const actionsWithKeys = ACTION_SPECS.filter(hasBinding);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
          <DialogDescription>
            Schneller durch Story Scout. ⌘K öffnet das Befehlsmenü (mit Suche und
            Hilfe), die Kürzel darunter sind direkte Sprünge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section title="Allgemein">
            <Row label="Befehlsmenü öffnen" binding={{ kind: 'chord', key: 'k' }} mac={mac} />
            <Row label="Tastenkürzel anzeigen" binding={{ kind: 'single', key: '?' }} mac={mac} />
          </Section>

          <Section title="Navigation">
            {navWithKeys.map((s) => (
              <Row key={s.id} label={s.label} binding={s.binding} mac={mac} />
            ))}
          </Section>

          {actionsWithKeys.length > 0 && (
            <Section title="Aktionen">
              {actionsWithKeys.map((s) => (
                <Row key={s.id} label={s.label} binding={s.binding} mac={mac} />
              ))}
            </Section>
          )}
        </div>

        <p
          className={cn(
            'mt-2 rounded-md border px-3 py-2 text-xs',
            shortcutsEnabled
              ? 'border-border bg-muted/50 text-muted-foreground'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/[0.08] dark:text-amber-300',
          )}
        >
          {shortcutsEnabled ? (
            <>
              Einzeltasten- und Sequenz-Kürzel sind aktiv. Abschaltbar unter{' '}
              <span className="font-medium">Einstellungen → Tastatur</span> (WCAG 2.1.4).
              ⌘K bleibt unabhängig davon erhalten.
            </>
          ) : (
            <>
              Einzeltasten-Kürzel sind aktuell <span className="font-medium">deaktiviert</span>.
              ⌘K funktioniert weiterhin. Wieder aktivierbar unter{' '}
              <span className="font-medium">Einstellungen → Tastatur</span>.
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
