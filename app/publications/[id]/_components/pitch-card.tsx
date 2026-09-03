'use client';

import { Zap } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { InfoBubble } from '@/components/info-bubble';
import { MeistertaskButton } from '@/components/meistertask-button';
import { Card, CardContent } from '@/components/ui/card';

interface PitchCardProps {
  pub: PublicationWithRelations;
  hasAnalysis: boolean;
}

/** Pitch — mobil an zweiter Stelle nach der Analyse (max-md:-order-4). */
export function PitchCard({ pub, hasAnalysis }: PitchCardProps) {
  if (!hasAnalysis || !pub.pitch_suggestion) return null;

  return (
    <Card className="border-[#d3e2ff] bg-[#f6f9ff] dark:border-brand/25 dark:bg-brand/[0.08] max-md:-order-4">
      <CardContent className="p-5">
        <h3 className="font-mono text-2xs font-semibold uppercase tracking-[0.07em] text-brand mb-2.5 inline-flex items-center gap-1.5">
          <Zap weight="fill" className="h-3.5 w-3.5" />
          Pitch-Vorschlag
          <InfoBubble id="pitch_suggestion" size="sm" />
        </h3>
        <p className="text-[15px] font-medium leading-relaxed">{pub.pitch_suggestion}</p>
        {pub.suggested_angle && (
          <p className="text-sm text-foreground/80 mt-3">
            <span className="font-semibold text-brand inline-flex items-center gap-1">
              Blickwinkel:
              <InfoBubble id="suggested_angle" size="sm" />
            </span>{' '}
            {pub.suggested_angle}
          </p>
        )}
        {pub.target_audience && (
          <p className="text-sm text-foreground/80 mt-1.5">
            <span className="font-semibold text-brand inline-flex items-center gap-1">
              Zielgruppe:
              <InfoBubble id="target_audience" size="sm" />
            </span>{' '}
            {pub.target_audience}
          </p>
        )}
        <div className="mt-4 pt-4 border-t border-brand/10 flex justify-end items-center gap-1.5">
          <MeistertaskButton pub={pub} />
          <InfoBubble id="meistertask_pitch" size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}
