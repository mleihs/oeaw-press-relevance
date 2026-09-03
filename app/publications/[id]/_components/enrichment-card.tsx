'use client';

import { useState } from 'react';
import { FileText } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import { EnrichmentSourceBadge } from '@/components/enrichment-source-badge';
import { venueDisplayLabel } from '@/lib/shared/venue-registry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/section-label';
import { VenueDisplay } from '@/components/venue-display';

interface EnrichmentCardProps {
  pub: PublicationWithRelations;
}

/** Enrichment card */
export function EnrichmentCard({ pub }: EnrichmentCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand" />
          Externe Anreicherung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pub.enriched_source && (
          <div>
            <SectionLabel className="mb-2">Quellen</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {pub.enriched_source.split('+').map((src) => (
                <EnrichmentSourceBadge key={src} source={src} />
              ))}
            </div>
          </div>
        )}
        {(pub.enriched_abstract || pub.abstract) && (
          <div>
            <SectionLabel>Abstract</SectionLabel>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {decodeHtmlBlock(pub.enriched_abstract || pub.abstract || '')}
            </p>
          </div>
        )}
        {pub.enriched_journal && (
          <div>
            <SectionLabel>{venueDisplayLabel(pub.enriched_journal)}</SectionLabel>
            <p className="text-sm">
              <VenueDisplay raw={pub.enriched_journal} />
            </p>
          </div>
        )}
        {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Schlagwörter</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {pub.enriched_keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
        {pub.full_text_snippet && <CollapsibleSnippet text={pub.full_text_snippet} />}
        {pub.word_count > 0 && (
          <div className="text-xs text-muted-foreground/70 border-t pt-3">
            {pub.word_count.toLocaleString()} Wörter angereicherter Inhalt
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CollapsibleSnippet({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  const display = isLong && !expanded ? text.slice(0, 500) + '...' : text;
  return (
    <div>
      <SectionLabel>Textauszug</SectionLabel>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{display}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand hover:underline mt-1">
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
