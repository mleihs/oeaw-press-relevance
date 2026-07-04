'use client';

import { X } from '@/lib/icons';
import type { BoardLabel } from '@/lib/shared/board';

/** Farbiges Label-Chip (MeisterTask-Tag). Getönter Hintergrund + Label-Farbe
 *  als Text, damit helle wie dunkle Labels lesbar bleiben. Optional mit
 *  Entfernen-X (Karten-Modal-Picker). */
export function LabelPill({
  label,
  onRemove,
  className,
}: {
  label: BoardLabel;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ${className ?? ''}`}
      style={{ backgroundColor: `${label.color}22`, color: label.color }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Label „${label.name}" entfernen`}
          className="ml-0.5 opacity-70 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
