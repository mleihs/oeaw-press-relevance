'use client';

import { Eye, EyeOff } from '@/lib/icons';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';

type Props = {
  /** The list currently hides N/A rows (hidesUnscored in ../_filters). */
  hiding: boolean;
  /** N/A rows that match every other filter, i.e. what „Einblenden" adds. */
  hiddenCount: number;
  onChange: (showNa: boolean) => void;
  className?: string;
};

/**
 * Status pill for the default filter that hides publications without a Story
 * Score. Unlike a filter chip it stays while the filter works: the list is a
 * filtered view by default, and the pill says so with the number of hidden
 * rows and a one-click way back. When the user shows N/A rows, it turns
 * neutral and offers to hide them again. Whether it renders at all is the
 * caller's call (unscoredPillVisible), so an empty pill never takes a row.
 */
export function UnscoredFilterPill({ hiding, hiddenCount, onChange, className }: Props) {
  if (hiding) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-50 py-0.5 pl-2.5 pr-0.5 text-xs text-brand',
          'dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-200',
          className,
        )}
      >
        <EyeOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Nur mit Story Score</span>
          {' · '}
          {hiddenCount.toLocaleString('de-AT')} ohne Score (N/A) ausgeblendet
        </span>
        <InfoBubble id="pub_filter_unscored" size="sm" />
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-label="Publikationen ohne Score einblenden"
          className="rounded-full px-2 py-0.5 font-semibold transition-colors hover:bg-brand/10 dark:hover:bg-brand-400/15"
        >
          Einblenden
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface py-0.5 pl-2.5 pr-0.5 text-xs text-ink-subtle',
        className,
      )}
    >
      <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>Auch Publikationen ohne Score (N/A)</span>
      <InfoBubble id="pub_filter_unscored" size="sm" />
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-label="Publikationen ohne Score ausblenden"
        className="rounded-full px-2 py-0.5 font-semibold text-ink transition-colors hover:bg-canvas"
      >
        Ausblenden
      </button>
    </div>
  );
}

/**
 * The pill shows while the filter hides something, and while the user has
 * opted in to N/A rows (to offer the way back). It stays away when a filter
 * for unscored rows overrides the default: that filter's chip explains the
 * list, and switching here would change nothing.
 */
export function unscoredPillVisible(opts: {
  hiding: boolean;
  showNa: boolean;
  hiddenCount: number;
}): boolean {
  return opts.hiding ? opts.hiddenCount > 0 : opts.showNa;
}
