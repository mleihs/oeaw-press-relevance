'use client';

import { Sparkles, Crown, BookOpen, Megaphone, ShieldCheck } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { PresetKey } from '../_filters';

const PRESET_CONFIG: Array<{
  key: PresetKey;
  label: string;
  Icon: typeof Sparkles;
}> = [
  { key: 'pitch',        label: 'Pitch-fertig',     Icon: Sparkles },
  { key: 'mahighlights', label: 'Eigen-Highlights', Icon: Crown },
  { key: 'wiss',         label: 'Wissenschaftlich', Icon: BookOpen },
  { key: 'popsci',       label: 'Popular Science',  Icon: Megaphone },
  { key: 'peer',         label: 'Peer-reviewed',    Icon: ShieldCheck },
];

type Props = {
  active: PresetKey;
  onSelect: (key: PresetKey) => void;
};

export function PresetBar({ active, onSelect }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter-Presets"
      className="flex flex-wrap items-center gap-1.5"
    >
      {PRESET_CONFIG.map(({ key, label, Icon }) => {
        const isActive = active === key;
        // Toggle buttons, not tabs: there are no tabpanels and selecting a
        // preset just applies a filter set, so aria-pressed is the correct
        // state (a tablist would promise arrow-key nav + panels). Ohne
        // InfoBubble je Chip (Comp-Filterleiste ist clean) — die Erklärungen
        // leben im Hilfe-Center.
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-brand text-white border-brand shadow-sm'
                : 'bg-card border-border text-foreground hover:border-muted-foreground/50 hover:bg-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
