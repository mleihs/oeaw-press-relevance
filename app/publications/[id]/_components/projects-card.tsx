'use client';

import { FolderOpen } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TintBadge } from '@/components/tint-badge';

interface ProjectsCardProps {
  pub: PublicationWithRelations;
}

/** Projects */
export function ProjectsCard({ pub }: ProjectsCardProps) {
  if (!pub.projects || pub.projects.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-brand" />
          Projekte ({pub.projects.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pub.projects.map((p) => {
          const isActive =
            p.ends_on && new Date(p.ends_on) > new Date() && !p.cancelled;
          return (
            <div key={p.id} className="text-sm border-l-2 border-border pl-3">
              <div className="flex items-start gap-2">
                <p className="font-medium flex-1">{p.title_de || p.title_en}</p>
                {isActive && (
                  <TintBadge color="green" className="text-2xs">aktiv</TintBadge>
                )}
                {p.cancelled && (
                  <TintBadge color="red" className="text-2xs">abgebrochen</TintBadge>
                )}
              </div>
              {p.summary_de && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.summary_de}</p>
              )}
              <p className="text-xs text-muted-foreground/70 mt-1">
                {p.starts_on ? new Date(p.starts_on).getFullYear() : '?'}
                {' – '}
                {p.ends_on ? new Date(p.ends_on).getFullYear() : 'offen'}
                {p.thematic_focus_de && ` | ${p.thematic_focus_de}`}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
