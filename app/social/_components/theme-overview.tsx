import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SocialThemeSnapshot } from '@/lib/shared/types';

export function ThemeOverview({ snapshot }: { snapshot: SocialThemeSnapshot }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="font-semibold">Themen-Lagebild</h2>
        <span className="text-xs text-muted-foreground">
          · {snapshot.post_count} Posts aus {snapshot.channel_count}{' '}
          {snapshot.channel_count === 1 ? 'Kanal' : 'Kanälen'}
        </span>
      </div>

      {snapshot.narrative_de && (
        <p className="text-sm leading-relaxed text-foreground/90">
          {snapshot.narrative_de}
        </p>
      )}

      {snapshot.themes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {snapshot.themes.map((t, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t.theme}</h3>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {t.post_count} Posts
                </Badge>
              </div>
              {t.description && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {t.description}
                </p>
              )}
              {t.keywords.length > 0 && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {t.keywords.slice(0, 6).map((k) => (
                    <span key={k} className="text-[10px] text-muted-foreground">
                      #{k}
                    </span>
                  ))}
                </div>
              )}
              {t.channels.length > 0 && (
                <p className="text-[10px] text-muted-foreground/70">
                  {t.channels.join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
