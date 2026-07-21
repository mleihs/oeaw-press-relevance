'use client';

import { LLM_MODELS, formatModelPricing } from '@/lib/shared/constants';
import { useModelPricing } from '@/lib/client/hooks/use-model-pricing';
import { cn } from '@/lib/shared/utils';

/**
 * Der kuratierte Modell-Picker mit Live-Preisen. EINE Implementierung für
 * beide Läufe, die OpenRouter-Guthaben kosten: das Bewerten-Modal
 * (components/scoring-modal.tsx) und den Social-Refresh
 * (app/social/_components/refresh-button.tsx).
 *
 * Vorher stand derselbe Block zweimal wortgleich da, inklusive Preisformat und
 * title-Attribut; die Live-Preise von 2026-07-21 mussten deshalb an zwei
 * Stellen nachgezogen werden. Ein Picker, der zwei verschiedene Zahlen für
 * dasselbe Modell zeigen kann, ist schlimmer als gar keine Preisanzeige.
 *
 * `enabled` steuert nur, ob die Preisabfrage laufen soll — die Aufrufer geben
 * `phase === 'idle'` durch, damit während eines Laufs nichts nachgeladen wird.
 */
export function ModelPicker({
  value,
  onChange,
  enabled,
  note,
}: {
  value: string;
  onChange: (model: string) => void;
  enabled: boolean;
  /** Optionale Zeile unter der Liste: was dieser Lauf konkret erfasst. */
  note?: React.ReactNode;
}) {
  const pricing = useModelPricing(enabled);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">Modell</p>
      <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-[11px] border border-line p-1.5">
        {LLM_MODELS.map((m) => {
          const selected = value === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-sm transition-colors',
                selected ? 'bg-foreground text-background' : 'hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                  selected ? 'border-background' : 'border-line-strong',
                )}
                aria-hidden
              >
                {selected && <span className="h-[7px] w-[7px] rounded-full bg-background" />}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
              <span
                title="Preis je 1 Mio. Tokens: Eingabe / Ausgabe"
                className={cn(
                  'shrink-0 whitespace-nowrap font-mono text-2xs',
                  selected ? 'text-background/70' : 'text-ink-soft',
                )}
              >
                {formatModelPricing(pricing[m.value] ?? m.fallbackPricing)}
              </span>
            </button>
          );
        })}
      </div>
      {note && <p className="text-2xs leading-relaxed text-ink-soft">{note}</p>}
    </div>
  );
}
