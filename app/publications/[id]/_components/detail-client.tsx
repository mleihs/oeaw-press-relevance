'use client';

import type { PublicationWithRelations } from '@/lib/shared/types';
import { HaikuBlock } from '@/components/haiku-block';
import { CreateCardButton } from '@/components/board/create-card-button';
import { publicationToCardSource } from '../_lib/publication-to-card-source';
import { DetailHeader } from './detail-header';
import { RelevanceAnalysisCard } from './relevance-analysis-card';
import { DecisionCard } from './decision-card';
import { PressReleaseCard } from './press-release-card';
import { PressReferenceCard } from './press-reference-card';
import { PitchCard } from './pitch-card';
import { SummaryCard } from './summary-card';
import { AuthorsCard } from './authors-card';
import { ProjectsCard } from './projects-card';
import { EnrichmentCard } from './enrichment-card';

interface Props {
  pub: PublicationWithRelations;
  titleForDisplay: string;
  abstractLooksGerman: boolean;
}

export function PublicationDetailClient({ pub, titleForDisplay, abstractLooksGerman }: Props) {
  const hasAnalysis = pub.analysis_status === 'analyzed' && pub.press_score !== null;

  return (
    // flex-col + gap statt space-y: erlaubt die Mobile-Reihenfolge (M6c, Mock
    // Z. 811ff: Score → Pitch zuerst) rein über order-Klassen, ohne die
    // Desktop-DOM-Ordnung anzufassen. max-md:pb-16 räumt die Sticky-Bar frei.
    <div className="flex flex-col gap-6 max-md:pb-16 md:grid md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] md:items-start md:gap-x-4 md:gap-y-6">
      {/* Header — volle Breite über beiden Spalten (Mock Z. 220–245) */}
      <DetailHeader pub={pub} titleForDisplay={titleForDisplay} hasAnalysis={hasAnalysis} />

      {/* ── Rechte Spalte (Mock Z. 305–351): sticky Relevanz-Analyse +
          Redaktionsentscheidung. Auf < md kollabiert das Grid zur Spalte, die
          `-order-5` schiebt sie mobil direkt hinter den Header (M6c). ── */}
      <div className="flex flex-col gap-4 md:col-start-2 md:row-start-2 md:sticky md:top-20 max-md:-order-5">
        {/* Relevanz-Analyse (Mock Z. 306–341) */}
        <RelevanceAnalysisCard pub={pub} hasAnalysis={hasAnalysis} />

        {/* Redaktionsentscheidung (Mock Z. 343–350) */}
        <DecisionCard pub={pub} />
      </div>

      {/* ── Linke Spalte (Mock Z. 224–302): Pitch, Haiku, Zusammenfassung,
          Autor:innen, externe Anreicherung + unsere Zusatz-Karten. ── */}
      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2 min-w-0">

      {/* ÖAW-Pressemitteilung (cross-reference zur TYPO3-news) */}
      <PressReleaseCard pub={pub} />

      {/* Press-Referenz (semantic SPECTER2-similarity, lazy own query). */}
      <PressReferenceCard pubId={pub.id} abstractLooksGerman={abstractLooksGerman} />

      {/* Pitch — mobil an zweiter Stelle nach der Analyse */}
      <PitchCard pub={pub} hasAnalysis={hasAnalysis} />

      {/* Haiku — poetic distillation of the content, bewusst VOR der WebDB-
          Zusammenfassung platziert. Gradient-Karte nach Comp Z. 274–283
          (blauer Verlauf, Lotus). */}
      {pub.haiku && (
        <HaikuBlock haiku={pub.haiku} model={pub.llm_model} variant="gradient" />
      )}

      {/* Bilingual summaries from WebDB */}
      <SummaryCard pub={pub} />

      {/* Autor:innen + Zitations-Footer */}
      <AuthorsCard pub={pub} />

      {/* Projects */}
      <ProjectsCard pub={pub} />

      {/* Enrichment card */}
      <EnrichmentCard pub={pub} />
      </div>
      {/* Ende linke Spalte */}

      {/* Sticky Mobile-Aktionsleiste über der Bottom-Tab-Nav (Mock Z. 886).
          Nur „Ins Board" — Verwerfen/Pitchen laufen über die DecisionToolbar
          oben (mit Rationale/Snooze), die mobil erhalten bleibt (vetobar). */}
      <div
        className="fixed inset-x-0 z-30 border-t border-line bg-surface px-3.5 py-2.5 md:hidden"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
      >
        <CreateCardButton
          source={publicationToCardSource(pub, titleForDisplay)}
          size="default"
          variant="default"
          wrapperClassName="flex w-full"
          className="flex-1"
        />
      </div>
    </div>
  );
}
