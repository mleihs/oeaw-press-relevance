'use client';

import { Switch } from '@/components/ui/switch';
import { InfoBubble } from '@/components/info-bubble';

type Props = {
  showAll: boolean;
  onChange: (next: boolean) => void;
  hiddenCount: number;
};

export function ShowAllToggle({ showAll, onChange, hiddenCount }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
        <Switch checked={showAll} onCheckedChange={onChange} />
        <span className="inline-flex items-center gap-1">
          Alle anzeigen
          <InfoBubble id="pub_filter_eligibility" />
        </span>
      </label>
      {!showAll && hiddenCount > 0 && (
        <span className="text-xs text-neutral-500">
          {hiddenCount.toLocaleString('de-AT')} ausgeblendet
        </span>
      )}
    </div>
  );
}
