'use client';

import type { PublicationWithRelations } from '@/lib/shared/types';
import { DecisionToolbar } from '@/components/decision-toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DecisionCardProps {
  pub: PublicationWithRelations;
}

/** Redaktionsentscheidung (Mock Z. 343–350): Pitchen/Verwerfen. Wir
 *  behalten die volle DecisionToolbar (Rationale/Snooze) statt der
 *  zwei Mock-Buttons — page-eigene Kernfunktion (vetobar). */
export function DecisionCard({ pub }: DecisionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Redaktionsentscheidung</CardTitle>
      </CardHeader>
      <CardContent>
        <DecisionToolbar pub={pub} />
      </CardContent>
    </Card>
  );
}
