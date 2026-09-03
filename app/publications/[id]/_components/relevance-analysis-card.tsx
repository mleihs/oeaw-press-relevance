'use client';

import { Brain } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { getScoreBandClass, getScoreBandStoryLabel } from '@/lib/shared/score-utils';
import { ScoreBar } from '@/components/score-bar';
import { InfoBubble } from '@/components/info-bubble';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionLabel } from '@/components/section-label';

interface RelevanceAnalysisCardProps {
  pub: PublicationWithRelations;
  hasAnalysis: boolean;
}

/** Relevanz-Analyse (Mock Z. 306–341): Story-Score-Kreis, die fünf
 *  Dimensions-Balken, Begründung und Modell-/Kosten-Provenienz. */
export function RelevanceAnalysisCard({ pub, hasAnalysis }: RelevanceAnalysisCardProps) {
  if (!hasAnalysis) return null;

  const pressScorePct = pub.press_score !== null ? Math.round(pub.press_score * 100) : null;

  return (
    <Card className="border-brand/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand" />
          Relevanz-Analyse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          {/* Comp Z. 327 + 885: 72px-Kreis, Geist Mono 22px. */}
          <div className={`flex items-center justify-center h-[72px] w-[72px] shrink-0 rounded-full font-mono text-[22px] font-bold ${
            getScoreBandClass(pub.press_score, 'hero')
          }`}>
            {pressScorePct}%
          </div>
          <div>
            <p className="font-medium text-lg flex items-center gap-1.5">
              Story Score
              <InfoBubble id="press_score" size="md" />
            </p>
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
              {getScoreBandStoryLabel(pub.press_score)}
              <InfoBubble id="score_band" />
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <ScoreBar dimension="public_accessibility" value={pub.public_accessibility} />
          <ScoreBar dimension="societal_relevance" value={pub.societal_relevance} />
          <ScoreBar dimension="novelty_factor" value={pub.novelty_factor} />
          <ScoreBar dimension="storytelling_potential" value={pub.storytelling_potential} />
          <ScoreBar dimension="media_timeliness" value={pub.media_timeliness} />
        </div>
        {pub.reasoning && (
          <div>
            <SectionLabel className="inline-flex items-center gap-1">
              Begründung
              <InfoBubble id="reasoning" size="sm" />
            </SectionLabel>
            <p className="text-sm text-foreground/80">{pub.reasoning}</p>
          </div>
        )}
        {pub.llm_model && (
          <div className="text-xs text-muted-foreground/70 border-t pt-3 inline-flex items-center gap-1">
            Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
            <InfoBubble id="ai_provenance" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
