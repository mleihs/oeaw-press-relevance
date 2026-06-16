'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

/**
 * Toggles the `?main=1` URL param that opts the main-site news folder
 * (institute = "OEAW - Home") back into the list. Default OFF → those events
 * are hidden; the press team usually wants institute/cluster events, not the
 * central-site announcements. URL-driven so the choice is shareable and the RSC
 * re-renders the filtered list + matching tab counts server-side.
 */
export function MainNewsToggle({ showMainNews }: { showMainNews: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onToggle = (checked: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (checked) next.set('main', '1');
    else next.delete('main');
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch id="events-main-news" checked={showMainNews} onCheckedChange={onToggle} />
      <Label
        htmlFor="events-main-news"
        className="cursor-pointer text-sm font-normal text-muted-foreground"
        title="Events aus dem News-Ordner der ÖAW-Hauptseite (OEAW - Home)"
      >
        ÖAW-Hauptseite einblenden
      </Label>
    </div>
  );
}
