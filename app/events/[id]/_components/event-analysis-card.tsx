'use client';

import { Sparkles, Megaphone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScoreBar } from '@/components/score-bar';
import { InfoBubble } from '@/components/info-bubble';
import { getScoreBandClass } from '@/lib/shared/score-utils';
import { EVENT_SCORE_COLORS, EVENT_SCORE_LABELS } from '@/lib/shared/constants';
import { eventDateFmt } from '@/app/events/_lib/event-format';
import type { Event } from '@/lib/server/events/to-api';

/** Relevanz-Score + Pitch for an analyzed event. Renders nothing until the
 *  event has been scored. Mirrors the publication detail Analyse/Pitch cards. */
export function EventAnalysisCard({ event }: { event: Event }) {
  if (event.analysis_status !== 'analyzed' || event.event_score === null) return null;

  const pct = Math.round(event.event_score * 100);

  return (
    <>
      <Card className="border-brand/20">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${getScoreBandClass(event.event_score, 'hero')}`}
            >
              {pct}%
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-lg font-medium">
                Relevanz-Score
                <InfoBubble id="event_score" size="md" />
              </p>
              <p className="text-sm text-muted-foreground">
                Eignung für die zentrale Veranstaltungsseite
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <ScoreBar dimension="public_appeal" value={event.public_appeal} label={EVENT_SCORE_LABELS.public_appeal} color={EVENT_SCORE_COLORS.public_appeal} explId="event_public_appeal" />
            <ScoreBar dimension="scientific_significance" value={event.scientific_significance} label={EVENT_SCORE_LABELS.scientific_significance} color={EVENT_SCORE_COLORS.scientific_significance} explId="event_significance" />
            <ScoreBar dimension="reach" value={event.reach} label={EVENT_SCORE_LABELS.reach} color={EVENT_SCORE_COLORS.reach} explId="event_reach" />
            <ScoreBar dimension="timeliness" value={event.timeliness} label={EVENT_SCORE_LABELS.timeliness} color={EVENT_SCORE_COLORS.timeliness} explId="event_timeliness" />
          </div>

          {event.reasoning && (
            <div>
              <h3 className="mb-1 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Begründung
                <InfoBubble id="event_reasoning" size="sm" />
              </h3>
              <p className="text-sm leading-relaxed text-foreground/80">{event.reasoning}</p>
            </div>
          )}

          {event.llm_model && (
            <div className="flex items-center gap-1 border-t pt-3 text-[11px] text-muted-foreground/70">
              <span>Modell: {event.llm_model}</span>
              {event.analysis_cost != null && <span>· Kosten: ${event.analysis_cost.toFixed(4)}</span>}
              {event.analyzed_at && <span>· {eventDateFmt.format(new Date(event.analyzed_at))}</span>}
              <InfoBubble id="event_ai_provenance" size="sm" />
            </div>
          )}
        </CardContent>
      </Card>

      {event.pitch_suggestion && (
        <Card className="border-brand/20 bg-brand/[0.02]">
          <CardContent className="p-5 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand">
              <Megaphone className="h-3.5 w-3.5" />
              Vorschlag für die Veranstaltungsseite
              <InfoBubble id="event_pitch" size="sm" />
            </h3>
            <p className="text-sm leading-relaxed">{event.pitch_suggestion}</p>

            {(event.suggested_angle || event.target_audience) && (
              <div className="space-y-1.5 border-t border-brand/10 pt-3">
                {event.suggested_angle && (
                  <p className="text-sm text-foreground/80">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Sparkles className="h-3 w-3 text-brand" />
                      Blickwinkel
                      <InfoBubble id="event_angle" size="sm" />:
                    </span>{' '}
                    {event.suggested_angle}
                  </p>
                )}
                {event.target_audience && (
                  <p className="text-sm text-foreground/80">
                    <span className="inline-flex items-center gap-1 font-medium">
                      Zielpublikum
                      <InfoBubble id="event_audience" size="sm" />:
                    </span>{' '}
                    {event.target_audience}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
