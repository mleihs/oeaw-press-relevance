'use client';

import { BookText } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionLabel } from '@/components/section-label';

interface SummaryCardProps {
  pub: PublicationWithRelations;
}

/** Bilingual summaries from WebDB */
export function SummaryCard({ pub }: SummaryCardProps) {
  if (!pub.summary_de && !pub.summary_en) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookText className="h-4 w-4 text-brand" />
          Zusammenfassung (WebDB)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pub.summary_de && (
          <div>
            <SectionLabel>Deutsch</SectionLabel>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{decodeHtmlBlock(pub.summary_de)}</p>
          </div>
        )}
        {pub.summary_en && pub.summary_en !== pub.summary_de && (
          <div>
            <SectionLabel>English</SectionLabel>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{decodeHtmlBlock(pub.summary_en)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
