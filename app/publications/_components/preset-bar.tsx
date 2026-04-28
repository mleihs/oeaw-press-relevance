'use client';

import { Sparkles, Crown, BookOpen, Megaphone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PresetKey } from '../_filters';

const PRESET_CONFIG: Array<{ key: PresetKey; label: string; Icon: typeof Sparkles }> = [
  { key: 'pitch', label: 'Pitch-fertig', Icon: Sparkles },
  { key: 'mahighlights', label: 'Eigen-Highlights', Icon: Crown },
  { key: 'wiss', label: 'Wissenschaftlich', Icon: BookOpen },
  { key: 'popsci', label: 'Popular Science', Icon: Megaphone },
  { key: 'peer', label: 'Peer-reviewed', Icon: ShieldCheck },
];

type Props = {
  active: PresetKey;
  onSelect: (key: PresetKey) => void;
};

export function PresetBar({ active, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESET_CONFIG.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-[#0047bb] text-white border-[#0047bb] shadow-sm'
                : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50',
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
